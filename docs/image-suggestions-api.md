# API suggestions d'images (tags)

Route: `GET/POST /api/image-suggestions`

## Variables d'environnement

- `PEXELS_API_KEY` (optionnel)
- `PIXABAY_API_KEY` (optionnel)
- `UNSPLASH_ACCESS_KEY` (optionnel)
- `IMAGE_CACHE_TTL_SECONDS` (optionnel, defaut: `1209600` = 14 jours)
- `IMAGE_CACHE_PATH` (optionnel, defaut: `/tmp/smoothies-image-suggestions-cache.json`)

> Le cache seed projet est lu depuis `data/image-suggestions-cache.json`.
> Le cache runtime est ecrit localement (par defaut dans `/tmp`).

## Exemple GET

```bash
curl "http://localhost:3000/api/image-suggestions?title=Smoothie%20banane%20fraise&tags=banane,fraise,yaourt&limit=5"
```

## Exemple POST

```bash
curl -X POST "http://localhost:3000/api/image-suggestions" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smoothie banane fraise",
    "tags": ["banane", "fraise", "yaourt"],
    "limit": 5
  }'
```

## Reponse

```json
{
  "query": "banana strawberry smoothie drink",
  "cacheKey": "e9f2...",
  "cacheHit": true,
  "providersUsed": ["pexels"],
  "items": [
    {
      "url": "https://...",
      "thumbUrl": "https://...",
      "provider": "pexels",
      "author": "John Doe",
      "width": 3000,
      "height": 2000
    }
  ]
}
```

## Notes

- Si aucune cle API n'est configuree, l'API renvoie un tableau vide (et met ce resultat en cache court).
- `refresh=true` (GET) ou `refresh: true` (POST) force un refresh en ignorant le cache.
