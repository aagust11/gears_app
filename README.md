# GearLab

GearLab és un simulador web interactiu d'engranatges inspirat en [gearsket.ch](https://gearsket.ch). L'aplicació et permet dibuixar engranatges amb el ratolí, connectar-los automàticament o amb cadenes, editar-ne les propietats i visualitzar com gira el conjunt amb relacions de transmissió calculades en temps real.

## Funcionalitats principals

- **Dibuix intuïtiu:** crea un engranatge dibuixant un cercle al canvas. El radi determina el nombre de dents inicials.
- **Connexió automàtica:** els engranatges que es toquen lateralment es connecten i comparteixen la relació de transmissió correctament.
- **Mode cadena:** connecta engranatges separats amb la mateixa direcció de gir utilitzant el mode cadena.
- **Editor flotant:** clica un engranatge per obrir un popup amb nombre de dents, RPM i direcció de gir. Els canvis s'apliquen instantàniament.
- **Simulació en temps real:** inicia la simulació per veure la rotació, línies de referència vermelles i etiquetes amb les relacions de transmissió.
- **Gestió del canvas:** elimina engranatges concrets o reinicia tot el disseny amb un sol botó.

## Posar-ho en marxa

No cal cap servidor especial: n'hi ha prou amb obrir `index.html` en qualsevol navegador modern.

Si prefereixes aixecar un servidor local:

```bash
python -m http.server 8000
```

I tot seguit visita `http://localhost:8000`.

## Controls

- **Dibuixar:** mantén el botó esquerre del ratolí i arrossega per establir el radi.
- **Arrossegar:** clica sobre un engranatge existent i mou-lo.
- **Editar:** clica sense arrossegar per obrir el panell d'edició.
- **Mode cadena:** activa'l amb el botó corresponent i selecciona dos engranatges.
- **Simulació:** utilitza el botó *Inicia simulació* / *Atura simulació*.
- **Escapament ràpid:** prem `Esc` per tancar el panell o sortir del mode cadena.

## Llicència

Aquest projecte es distribueix sota la [llicència MIT](LICENSE).
