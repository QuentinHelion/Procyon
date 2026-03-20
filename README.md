# Procyon

Application web **ultra légère** de suivi des vulnérabilités : tableau en colonnes (style To Do), saisie manuelle et import de rapports via des **modèles de scan** extensibles.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Tailwind CSS** v4
- **Docker Compose** (application + base)

## Démarrage local

1. Copier l’environnement :

   ```bash
   cp .env.example .env
   ```

2. Démarrer PostgreSQL (ou utiliser une instance existante et adapter `DATABASE_URL`).

3. Installer et migrer :

   ```bash
   npm install
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

4. Ouvrir [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker compose up --build
```

L’application écoute sur le port **3000**. Les migrations et le seed des modèles intégrés s’exécutent au démarrage du conteneur.

## Modèles de scan

- **pingcastle-xml** : parseur `pingcastle_xml` pour les exports XML PingCastle (détection souple des nœuds de type règle de risque).
- **generic-csv** : parseur `generic_csv` ; en-tête CSV : `title`, `severity`, `description` (optionnel), `externalRef` (optionnel). Valeurs de `severity` : `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

Depuis l’UI, **Nouveau modèle** permet d’ajouter un enregistrement (nom, slug, parseur) réutilisant un parseur déjà codé.

### Ajouter un nouvel outil (développeur)

1. Implémenter une fonction de parse dans `src/lib/parsers/` qui renvoie `ParseResult`.
2. L’enregistrer dans `src/lib/parsers/index.ts` (`runParser`).
3. Ajouter l’identifiant dans `KNOWN_PARSERS` dans `src/app/api/templates/route.ts`.
4. (Optionnel) seed ou création UI d’un modèle pointant vers ce `parserId`.

## API (aperçu)

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `GET` / `POST` | `/api/vulnerabilities` | Lister / créer |
| `PATCH` / `DELETE` | `/api/vulnerabilities/[id]` | Mettre à jour / supprimer |
| `GET` / `POST` | `/api/templates` | Lister / créer un modèle |
| `POST` | `/api/import` | `multipart/form-data` : `file`, `templateSlug` |

Les imports avec `externalRef` mettent à jour une entrée existante portant la même référence.

## Licence

Projet exemple — adaptez selon vos besoins.
