# A sajtóiroda működési modellje

A rendszer hierarchikus, de nem merev. Az élő emberi vezető a stratégiai központ: ő határozza meg a prioritásokat, a hangnemet és a „vörös vonalakat”, és ő dönt a legfontosabb megszólalásokról. Az AI-munkatársak végrehajtó és elemző szerepet töltenek be, folyamatos visszacsatolással.

```mermaid
flowchart TB
    V["Emberi vezető<br/>prioritás, hangnem, vörös vonalak, jóváhagyás"]
    M["3. Monitoring"]
    P["4. Proaktív stratégia"]
    K["1. Kapcsolattartó"]
    F["2. Sajtófelkészítő"]
    E["5. Eseményszervező"]
    A["6. Archívum"]
    S["7. Közösségi média"]
    J["8. Jogi és kockázat"]

    M -- "napirendi összefoglaló" --> V
    P -- "napirendi összefoglaló" --> V
    K -- "sürgős megkeresések" --> V
    M -- "jelzés" --> P
    P -- "javaslat" --> F
    V -- "jóváhagyott koncepció" --> E
    A -. "korábbi nyilatkozatok" .-> F
    A -. "konzisztencia" .-> K
    S -- "digitális jelzések" --> M
    J -. "kockázatvizsgálat" .-> K
    J -. "kockázatvizsgálat" .-> E
    V -- "utasítás, override" --> K
    V -- "utasítás, override" --> F
```

## 1. Napi ciklus

1. Reggel a Monitoring Munkatárs és a Proaktív Stratégia Munkatárs közösen napirendi összefoglalót készít a vezetőnek.
2. A Kapcsolattartó Munkatárs jelzi a beérkezett sürgős megkereséseket.
3. A vezető 15–30 perc alatt rangsorolja a teendőket, és utasításokat ad.

## 2. Feladatkiosztás és együttműködés

A munkatársak egymás között is kommunikálnak:

- a Monitoring Munkatárs jelzése alapján a Proaktív Munkatárs javaslatot tesz,
- a Felkészítő Munkatárs azonnal elkezdi a Q&A anyagot,
- az Eseményszervező csak akkor lép, ha a vezető jóváhagyta a koncepciót.

## 3. Emberi kontrollpontok

- Minden kimenő válasz, nyilatkozat és meghívó a vezető (vagy az általa kijelölt helyettes) jóváhagyásával megy ki.
- A rendszer naplózza, melyik munkatárs milyen javaslatot tett, és rögzíti a vezető döntését is. Ez a későbbi tanulás és audit alapja.
- A vezető bármikor „override” parancsot adhat, vagy ideiglenesen kikapcsolhat bizonyos munkatársakat.

## 4. Heti és havi ritmus

- **Hetente** stratégiai áttekintés: mely üzenetek működtek, hol volt rés a kommunikációban, milyen új témák merültek fel.
- **Havonta** a vezető értékeli a munkatársak teljesítményét (pontosság, hasznosság, hangnem-illeszkedés), és finomhangolja a paramétereket.

## 5. Skálázhatóság és specializáció

Amikor a konkrét szakmai terület (például egészségügy, energia, közigazgatás, tech) ismertté válik, a munkatársak promptjai és tudásbázisa specializálható. Az általános struktúra azonban már most stabil keretet ad.
