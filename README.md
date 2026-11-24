# Hybryda – osobisty tracker treningowy (PWA)

Statyczna aplikacja (HTML/JS, bez serwera). Dane zapisują się lokalnie na telefonie.

## Uruchomienie na iPhonie
PWA musi być serwowana przez HTTPS. Najprościej:
- **GitHub Pages**: wrzuć zawartość folderu do repozytorium → Settings → Pages → branch `main`, folder `/`.
- **Netlify Drop**: przeciągnij folder na https://app.netlify.com/drop.

Potem w Safari: Udostępnij → „Do ekranu początkowego”.

## Integracje (bez serwera – wywołania prosto z telefonu)
- **Asystent AI** – Google Gemini API. Klucz z https://aistudio.google.com/apikey wklejasz w zakładce *Asystent*; zostaje tylko na urządzeniu (nie trafia do eksportu JSON). Zalecane: ogranicz klucz do Generative Language API i witryny `okolacki.github.io/*`.
- **Strava** – własna aplikacja API (strava.com/settings/api, Callback Domain = host strony). Client ID/Secret wpisujesz w zakładce *Bieg*. Powrót z autoryzacji obsługuje `strava.html`.
- **Kalendarz** – eksport slotów do pliku .ics z przypomnieniem.

## Lokalnie
```
python -m http.server 8765
```
→ http://localhost:8765

## Aktualizacje
Po zmianie plików podbij `CACHE` w `sw.js` (np. `hybryda-v2`).
