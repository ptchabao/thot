# Thot

Application Next.js pour lister et télécharger les fichiers de live TikTok depuis un serveur distant via SSH.

**Thot** - Nommé en l'honneur du dieu égyptien de la sagesse et de l'écriture, avec une interface inspirée de l'intérieur du temple de Thot.

## Installation

1. Installer les dépendances :
```bash
npm install
```

2. Configurer les variables d'environnement :
```bash
cp .env.local.example .env.local
```

Puis éditer `.env.local` avec vos identifiants SSH :
```
SSH_HOST=31.207.39.238
SSH_USER=root
SSH_PASSWORD=votre_mot_de_passe
SSH_BASE_PATH=/home/DouyinLiveRecorder/downloads/TikTok直播
```

## Utilisation

1. Démarrer le serveur de développement :
```bash
npm run dev
```

2. Ouvrir [http://localhost:3000](http://localhost:3000) dans votre navigateur

## Fonctionnalités

- Liste tous les créateurs de live
- Affiche tous les fichiers .ts disponibles pour chaque créateur
- Télécharge les fichiers en MP4 (conversion automatique du nom)
- Interface moderne style Netflix avec arrière-plan du temple de Thot
- Design responsive avec logo du dieu Thot
- Carrousels horizontaux pour chaque créateur
- Affichage de la taille et de la date des fichiers

## Notes

- Les fichiers sont téléchargés directement depuis le serveur SSH
- Le nom de fichier est automatiquement converti de .ts à .mp4 lors du téléchargement
- Assurez-vous que le serveur SSH est accessible depuis votre machine

