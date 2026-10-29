# Napló – a séma (platformfüggetlen)

A napló hozzáfűzős: sor nem módosítható és nem törölhető (kivéve a megőrzési idő lejárta utáni törlést). Ugyanez a séma él Make-adattárban, D1-táblában vagy bármilyen más tárban.

| Mező | Tartalom | Példa |
|------|----------|-------|
| `id` | egyedi azonosító | `2026-10-30T05:30:12Z-0007` |
| `ido` | UTC időbélyeg | `2026-10-30T05:30:12Z` |
| `tenant_id` | az ügyfél azonosítója (profil `ugyfel_id`) | `pelda-ugyfel` |
| `szereplo` | `ugynok:monitoring`, `ember:<vezeto>`, `rendszer` | `ugynok:monitoring` |
| `tipus` | lásd lent | `cikk_besorolas` |
| `hivatkozas` | az érintett tárgy azonosítója (cikk URL, szemle id) | `https://...` |
| `tartalom` | a javaslat vagy a döntés rövid szövege / JSON | `{"hangnem":"negativ",...}` |
| `dontes_ref` | ha ez egy döntés, melyik javaslatra vonatkozik | `...-0007` |

**Esemény-típusok:** `cikk_besorolas`, `trendjelzes`, `voros_vonal_jelzes`, `szemle_elkuldve`, `vezeto_visszajelzes`, `utasitas`, `javaslat`, `atadas`, `dokumentum`, `dontes`, `kerdes`, `profil_modositas`, `ugynok_ki_be_kapcsolas`, `hiba`.

**Szabály:** a `tenant_id` minden lekérdezésben kötelező szűrő; a naplót ügyfelenként külön exportálni is lehessen (ez a leválasztás egyik feltétele).
