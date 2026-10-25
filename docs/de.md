# Alpha ESS

## Überblick

Diese Integration bringt die Alpha-ESS-Hybridwechselrichter, Batterien und Wallboxen deines Kontos in Gladys, über die offizielle [Alpha ESS Open API](https://open.alphaess.com) und dein eigenes Entwicklerkonto. Sie ist nicht mit Alpha ESS verbunden.

- Ein Gerät pro System: Solarleistung, Batteriestand, Lade- und Entladeleistung, Netzleistung (Bezug +, Einspeisung −), Hausverbrauch, Energien des Tages und Zählerstände.
- Ein Gerät pro Alpha-ESS-Wallbox: Steckerstatus, Ladezustand, Leistung.
- Drei Dashboard-Widgets: Energiefluss jetzt, heute (mit der Leistungskurve des Tages), Batteriezeitplan.
- Szenen-Auslöser: Batterie voll, Batterie an der Entladegrenze, Einspeisung oder Netzbezug beginnt, System offline oder wieder da, Wallbox-Status, Zugriff verweigert.
- Szenen-Aktionen: Laden aus dem Netz, Zeitsteuerung der Entladung, Wallbox starten oder stoppen (aus, bis du sie erlaubst), Energien von heute.

Transport: Cloud. Deine AppID, die Seriennummern deiner Systeme und die Einstellungen, die deine Szenen ändern, gehen an die Alpha-ESS-Cloud (`openapi.alphaess.com`); das AppSecret verlässt Gladys nie (nur eine Signatur jeder Anfrage).

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein Alpha-ESS-System, das seine Daten an die Alpha-ESS-Cloud sendet (es erscheint in der Alpha-ESS-App).
- **Ein Entwicklerkonto** (kostenlos) auf [open.alphaess.com](https://open.alphaess.com). Unter **Development Management → Developer Information** kopierst du die **Developer ID (AppID)** und das **Developer Secret (AppSecret)**.
- **Dein System mit der AppID verknüpft**: Füge das System im Portal mit seiner **Seriennummer (SN)** und seinem **CheckCode** hinzu, beide auf dem Etikett des Wechselrichters (oder von deinem Installateur). Wenn das Portal nie die Bestätigungs-E-Mail schickt, nutze die Verknüpfungs-Schaltflächen der Konfiguration (siehe unten).

Das Tempo: Alpha ESS verlangt **mindestens 10 Sekunden zwischen zwei Anfragen** und antwortet sonst „zu schnell“ (6053). Die Integration sendet eine Anfrage nach der anderen, 10 Sekunden auseinander, und wird von selbst langsamer, wenn Alpha ESS darum bittet.

## Konfiguration

| Feld                                     | Bedeutung                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| AppID (Developer ID)                     | Die Developer ID des Portals, beginnt mit `alpha`                                             |
| AppSecret (Developer Secret)             | Das Developer Secret des Portals (ein Secret, nie wieder angezeigt und nie in den Logs)       |
| Szenen dürfen den Wechselrichter steuern | Standardmäßig aus; an, dürfen Szenenaktionen die Batterieeinstellungen und die Wallbox ändern |
| Abfrage der Leistung                     | Alle 30 s, 1 min (Standard), 2 min oder 5 min; bei mehreren Systemen seltener                 |
| Sprache der Texte                        | Namen der Funktionen, Szenentexte und Fehler; automatisch folgt dem zuletzt gezeigten Widget  |

Schaltflächen:

- **Verbindung testen** listet die mit der AppID verknüpften Systeme (Seriennummer, Modell, Solarleistung, Batteriegröße).
- **Verknüpfungscode anfordern** (Seriennummer + CheckCode): Alpha ESS schickt dem Besitzer des Systems einen Bestätigungscode per E-Mail. **System verknüpfen** (Seriennummer + Code) verknüpft es mit deiner AppID. Sein Gerät erscheint dann in der Suche.
- **Diagnose** schreibt den Zustand der Integration in ihre Logs, ohne das Secret.

## Verwendung

### Geräte

Öffne **Entdecken** und füge deine Systeme hinzu. Ein System-Gerät hat:

- **Solarerzeugung** (W), **Hausverbrauch** (W), **Netzleistung** (W, positiv bei Bezug, negativ bei Einspeisung);
- mit Batterie: **Batteriestand** (%), **Ladeleistung** und **Entladeleistung** (W, beide positiv);
- **Solarerzeugung heute** und **Hausverbrauch heute** (kWh);
- **Zählerstände** (kWh): Solarerzeugung, Netzbezug, Netzeinspeisung und, mit Batterie, Batterieladung und -entladung.

Die Open API liefert die Energien jedes Tages, nicht den Zähler des Wechselrichters: Die Integration addiert die Tage selbst. Die Zählerstände beginnen am ersten Tag der Integration bei 0, sinken nie und werden nach Mitternacht mit dem Ende des Vortags korrigiert. Es sind Verlaufszähler: Keiner zählt als Verbrauch deines Hauses, ein Smart Meter speist das Energie-Dashboard also weiterhin allein, ohne Doppelzählung.

Ein Wallbox-Gerät hat seinen **Steckerstatus**, seinen **Ladezustand** und seine **Ladeleistung** (W).

### Dashboard-Widgets

![Die drei Widgets: Energiefluss jetzt, heute mit der Leistungskurve, Batteriezeitplan (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-alpha-ess/main/docs/assets/widgets.de.png)

- **Alpha ESS jetzt**: Batteriestand, Solar, Haus, Netz (ins oder aus dem Netz), Batterie (lädt oder entlädt), Zeit der Abfrage und Autarkie des Tages; „offline seit…“ in Rot, wenn Alpha ESS das System als offline meldet.
- **Alpha ESS heute**: Solar, Haus, Netzbezug und Einspeisung des Tages, Autarkie, die Leistungskurve des Tages (nur gelesen, solange das Widget angezeigt wird), geladene und entladene Batterieenergie.
- **Batteriezeitplan**: Laden aus dem Netz (an oder aus, Zeiträume, bis zu welchem SOC) und Zeitsteuerung der Entladung (an oder aus, Zeiträume, Entladegrenze) in der Cloud, und ob deine Szenen sie ändern dürfen.

Wähle das System in den Einstellungen des Widgets (leer: das erste).

### Szenen

Auslöser (einmal pro Änderung, nie bei der ersten Abfrage):

- **Alpha ESS: Batterie voll**: Die Batterie erreicht 100 % (erneut, nachdem sie unter 95 % fiel).
- **Alpha ESS: Batterie an der Entladegrenze**: Die Batterie erreicht die Entladegrenze (+1 Punkt).
- **Alpha ESS: Einspeisung beginnt** / **Netzbezug beginnt**: 200 W oder mehr, zwei Abfragen hintereinander.
- **Alpha ESS: System offline** (10 Minuten) / **System wieder online**.
- **Alpha ESS: Wallbox-Status geändert**: eingesteckt, lädt, pausiert, beendet, Störung; Filter auf den neuen Status.
- **Alpha ESS: Zugriff verweigert**: AppID oder AppSecret abgelehnt, Uhr des Rechners falsch, IP nicht erlaubt oder System nicht verknüpft.

Aktionen (die ersten drei brauchen **Szenen dürfen den Wechselrichter steuern**):

- **Alpha ESS: Laden aus dem Netz**: an, aus oder unverändert, zwei Zeiträume wie `01:00-05:00` (Viertelstunden, `off` leert einen), der SOC, bei dem es stoppt (10 bis 100). Leere Felder behalten ihren Wert. Die aktuelle Einstellung wird zuerst gelesen und die ganze Einstellung geschrieben; nichts wird gesendet, wenn sich nichts ändert.
- **Alpha ESS: Zeitsteuerung der Entladung**: dasselbe für die Entladung, mit ihrer Entladegrenze.
- **Alpha ESS: Wallbox starten oder stoppen**.
- **Alpha ESS: Energien von heute**: Solar, Haus, Bezug, Einspeisung, geladene und entladene Batterie, Autarkie, Batteriestand und ein Satz, ohne Anfrage.

Alpha ESS dokumentiert die beiden Batterieeinstellungen als **etwa einmal pro Tag** änderbar: Eine zweite Änderung am selben Tag kann abgelehnt werden. Bei einigen neueren Wechselrichtern (SMILE-G3) liegt der Zeitplan der App woanders und diese Einstellungen werden eventuell ignoriert: Prüfe das Ergebnis in der Alpha-ESS-App, bevor du dich darauf verlässt.

Beispiele:

1. Jeden Tag um 22:00, wenn die Batterie unter 40 % ist → **Alpha ESS: Laden aus dem Netz** an, Zeitraum `01:00-05:00`, bis 80 %; um 06:00 → aus.
2. Bei **Alpha ESS: Einspeisung beginnt** → den Warmwasserspeicher einschalten; bei **Netzbezug beginnt** → ausschalten.
3. Bei **Alpha ESS: System offline** → eine Benachrichtigung senden „Der Wechselrichter ist seit {{triggerEvent.data.minutes_offline}} min offline“.
4. Jeden Abend um 21:00 → **Alpha ESS: Energien von heute** → eine Nachricht mit ihrer Ausgabe `summary` senden.

## Fehlerbehebung

- **„Alpha ESS lehnt die AppID oder das AppSecret ab“** (6007): Kopiere beide erneut aus Developer Information, ohne Leerzeichen davor oder danach.
- **„Das System … ist nicht mit dieser AppID verbunden“** (6005): Verknüpfe es im Portal oder mit **Verknüpfungscode anfordern** und dann **System verknüpfen**.
- **„Die Uhr des Gladys-Rechners weicht um mehr als 5 Minuten ab“** (6006): Stelle die Uhr des Rechners (NTP).
- **„Die IP-Whitelist des Entwicklerkontos ist aktiv“** (6009): Füge die öffentliche Adresse deines Gladys hinzu oder schalte die Liste aus.
- **„Alpha ESS bittet um weniger Anfragen“** (6053): Vielleicht nutzt eine andere App (Home Assistant…) dieselbe AppID; die Abfragen laufen nach einer Minute weiter.
- **„Die Steuerung ist aus“**: Aktiviere **Szenen dürfen den Wechselrichter steuern**.
- **Eine Einstellung geändert, aber der Wechselrichter tut nichts**: Alpha ESS hat sie in der Cloud angenommen; bei manchen Modellen gewinnt der Zeitplan der App. Prüfe es in der Alpha-ESS-App.
- **„Alpha ESS liefert die Batterieeinstellungen dieses Systems nicht“** (6017): Dein Modell oder Konto hat über die Open API keinen Zugriff darauf.
- Melde ein Problem auf GitHub mit den Versionen von Gladys und der Integration, dem Modell des Wechselrichters, der Meldung von **Verbindung testen** und den Zeilen von **Diagnose**. Füge nie dein AppSecret ein.
