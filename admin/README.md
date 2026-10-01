# Sneep Cut Admin

Aplicație administrativă separată de produsul principal. Are propriul build,
container și server web. Interfața apelează exclusiv endpointurile server-side
din namespace-ul `/api/admin`; rolul din browser nu acordă acces.

## Pornire locală

După aplicarea migrărilor și pornirea stackului, consola este disponibilă la
`http://localhost:3002`.

Primul administrator se acordă explicit unui cont Sneep Cut existent:

```bash
docker compose exec backend /adminctl grant admin@example.com
```

Utilizatorul trebuie să se autentifice din nou după acordarea rolului. Toate
schimbările făcute din consolă cer un motiv și sunt salvate în
`admin_audit_events`.

## Dezvoltare

```bash
npm install
npm run dev
npm run build
```

Vite rulează implicit pe portul `3002` și proxiază API-ul către
`http://localhost:8080`. În Docker, serviciul `admin` comunică direct cu
serviciul `backend` și rămâne independent de frontendul principal.
