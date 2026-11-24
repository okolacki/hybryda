# Hybryda – osobisty tracker treningowy (PWA)

Statyczna aplikacja (HTML/JS, bez serwera). Dane zapisują się lokalnie na telefonie.

## Uruchomienie na iPhonie
PWA musi być serwowana przez HTTPS. Najprościej:
- **GitHub Pages**: wrzuć zawartość folderu do repozytorium → Settings → Pages → branch `main`, folder `/`.
- **Netlify Drop**: przeciągnij folder na https://app.netlify.com/drop.

Potem w Safari: Udostępnij → „Do ekranu początkowego”.

## Lokalnie
```
python -m http.server 8765
```
→ http://localhost:8765

## Aktualizacje
Po zmianie plików podbij `CACHE` w `sw.js` (np. `hybryda-v2`).
