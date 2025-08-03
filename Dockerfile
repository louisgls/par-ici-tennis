# Utilise une image Node.js stable officielle
FROM node:24-slim

# Crée l'app directory
WORKDIR /app

# Copie package.json et package-lock.json d'abord (pour cache docker efficace)
COPY package*.json ./

# Installe les dépendances (en mode prod)
RUN npm ci --omit=dev

# Copie tout le code de l'app
COPY . .

# Expose le port utilisé par le serveur Express
EXPOSE 3001

# Commande de démarrage
CMD ["npm", "start"]
