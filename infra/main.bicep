// Déploiement Azure d'Inspect IA — App Service (backend, worker, frontend sur un
// même App Service Plan) + Azure Database for PostgreSQL Flexible Server +
// Storage Account (photos + rapports). Environnement entièrement séparé du
// déploiement microk8s existant (k8s/) — sa propre base de données, son propre
// stockage. Voir infra/README.md pour la marche à suivre complète.
//
// Déploiement (dans un resource group existant) :
//   az deployment group create -g <resource-group> -f infra/main.bicep \
//     --parameters postgresAdminPassword=<...> secretKey=<...> anthropicApiKey=<...> voyageApiKey=<...>

@description('Préfixe utilisé pour nommer les ressources')
param baseName string = 'inspect-ia'

param location string = resourceGroup().location

@description('SKU du plan App Service — doit supporter "Always On" (pas F1/D1), requis pour que le worker ne soit pas déchargé faute d\'activité HTTP')
param appServicePlanSku string = 'B2'

param postgresAdminLogin string = 'inspectadmin'

@secure()
param postgresAdminPassword string

@secure()
param secretKey string

@secure()
param anthropicApiKey string

@secure()
param voyageApiKey string

@description('Image backend/worker (même image, commande de démarrage différente pour le worker)')
param backendImage string = 'ghcr.io/ronaldodia/ai-inspection-assistant-backend:latest'

@description('Image frontend — build distinct de celle utilisée par microk8s, car NEXT_PUBLIC_API_URL est figé au build et doit pointer vers le backend Azure')
param frontendImage string = 'ghcr.io/ronaldodia/ai-inspection-assistant-frontend-azure:latest'

@description('Utilisateur pour tirer les images depuis un registre privé (laisser vide si les packages GHCR sont publics)')
param registryUsername string = ''

@secure()
param registryPassword string = ''

var uniqueSuffix = uniqueString(resourceGroup().id)
var storageAccountName = 'inspectiast${uniqueSuffix}'
var postgresServerName = '${baseName}-pg-${uniqueSuffix}'
var appServicePlanName = '${baseName}-plan'
var backendAppName = '${baseName}-backend-${uniqueSuffix}'
var workerAppName = '${baseName}-worker-${uniqueSuffix}'
var frontendAppName = '${baseName}-frontend-${uniqueSuffix}'
var postgresDatabaseName = 'inspect_app'
var photosContainerName = 'photos'
var reportsContainerName = 'reports'

var frontendUrl = 'https://${frontendAppName}.azurewebsites.net'
var backendUrl = 'https://${backendAppName}.azurewebsites.net'
var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresServerName}.postgres.database.azure.com:5432/${postgresDatabaseName}?sslmode=require'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource photosContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: photosContainerName
  properties: { publicAccess: 'None' }
}

resource reportsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: reportsContainerName
  properties: { publicAccess: 'None' }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: postgresDatabaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Autorise les services Azure (dont les App Services ci-dessous, non intégrés à
// un VNet dans cette configuration simple) à atteindre le serveur Postgres.
resource postgresFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Contrairement à Postgres auto-hébergé, Azure Database for PostgreSQL refuse
// CREATE EXTENSION tant que l'extension n'est pas explicitement allow-listée ici
// — même pour une extension standard comme pgcrypto (requise par schema.sql /
// backend/migrations pour gen_random_uuid()). Sans ça, les migrations échouent
// au tout premier démarrage du backend.
resource postgresExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-06-01-preview' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: 'PGCRYPTO,VECTOR'
    source: 'user-override'
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: { name: appServicePlanSku }
  properties: { reserved: true }
}

var registrySettings = empty(registryUsername) ? [] : [
  { name: 'DOCKER_REGISTRY_SERVER_URL', value: 'https://ghcr.io' }
  { name: 'DOCKER_REGISTRY_SERVER_USERNAME', value: registryUsername }
  { name: 'DOCKER_REGISTRY_SERVER_PASSWORD', value: registryPassword }
]

resource backendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: backendAppName
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${backendImage}'
      alwaysOn: true
      appSettings: concat(registrySettings, [
        { name: 'WEBSITES_PORT', value: '8000' }
        { name: 'DATABASE_URL', value: databaseUrl }
        { name: 'SECRET_KEY', value: secretKey }
        { name: 'ANTHROPIC_API_KEY', value: anthropicApiKey }
        { name: 'VOYAGE_API_KEY', value: voyageApiKey }
        { name: 'STORAGE_BACKEND', value: 'azure' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'AZURE_PHOTOS_CONTAINER', value: photosContainerName }
        { name: 'AZURE_REPORTS_CONTAINER', value: reportsContainerName }
        { name: 'CORS_ORIGINS', value: '["${frontendUrl}"]' }
      ])
    }
  }
}

resource workerApp 'Microsoft.Web/sites@2023-01-01' = {
  name: workerAppName
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${backendImage}'
      appCommandLine: 'python -m worker.worker'
      alwaysOn: true
      appSettings: concat(registrySettings, [
        // Le worker n'est pas un serveur HTTP, mais App Service tue le
        // conteneur si rien n'écoute sur le port attendu — worker.py démarre
        // un listener HTTP minimal juste pour satisfaire cette sonde.
        { name: 'WEBSITES_PORT', value: '8000' }
        { name: 'DATABASE_URL', value: databaseUrl }
        { name: 'SECRET_KEY', value: secretKey }
        { name: 'ANTHROPIC_API_KEY', value: anthropicApiKey }
        { name: 'VOYAGE_API_KEY', value: voyageApiKey }
        { name: 'STORAGE_BACKEND', value: 'azure' }
        { name: 'AZURE_STORAGE_CONNECTION_STRING', value: storageConnectionString }
        { name: 'AZURE_PHOTOS_CONTAINER', value: photosContainerName }
        { name: 'AZURE_REPORTS_CONTAINER', value: reportsContainerName }
      ])
    }
  }
}

resource frontendApp 'Microsoft.Web/sites@2023-01-01' = {
  name: frontendAppName
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${frontendImage}'
      alwaysOn: true
      appSettings: concat(registrySettings, [
        { name: 'WEBSITES_PORT', value: '3000' }
      ])
    }
  }
}

// Pas de sortie contenant databaseUrl/storageConnectionString — ce sont des
// secrets (mot de passe Postgres, clé de storage) et les sorties de déploiement
// Bicep ne sont pas garanties d'être masquées dans l'historique. Reconstruisez
// l'URL de connexion vous-même à partir de postgresServerName et du mot de passe
// déjà fourni en paramètre — voir infra/README.md.
output backendUrl string = backendUrl
output frontendUrl string = frontendUrl
output backendAppName string = backendApp.name
output workerAppName string = workerApp.name
output frontendAppName string = frontendApp.name
output postgresServerName string = postgres.name
output storageAccountName string = storageAccount.name
