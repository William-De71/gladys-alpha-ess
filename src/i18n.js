// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, widget contents, statuses, scene texts and errors,
// results of the configuration buttons. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo) and of its energy categories (batterie de
// stockage, réseau électrique); German says "du", Spanish "usted", like
// Gladys. Serial numbers and models are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // features
  feature_pv_power: {
    en: 'Solar production',
    fr: 'Production solaire',
    de: 'Solarerzeugung',
    es: 'Producción solar',
  },
  feature_battery_level: {
    en: 'Battery level',
    fr: 'Niveau de batterie',
    de: 'Batteriestand',
    es: 'Nivel de batería',
  },
  feature_battery_charge_power: {
    en: 'Battery charge power',
    fr: 'Puissance de charge',
    de: 'Ladeleistung',
    es: 'Potencia de carga',
  },
  feature_battery_discharge_power: {
    en: 'Battery discharge power',
    fr: 'Puissance de décharge',
    de: 'Entladeleistung',
    es: 'Potencia de descarga',
  },
  feature_grid_power: {
    en: 'Grid power (import +, export −)',
    fr: 'Réseau électrique (import +, export −)',
    de: 'Netzleistung (Bezug +, Einspeisung −)',
    es: 'Red eléctrica (importación +, exportación −)',
  },
  feature_load_power: {
    en: 'House consumption',
    fr: 'Consommation de la maison',
    de: 'Hausverbrauch',
    es: 'Consumo de la casa',
  },
  feature_pv_today: {
    en: 'Solar production today',
    fr: 'Production solaire du jour',
    de: 'Solarerzeugung heute',
    es: 'Producción solar de hoy',
  },
  feature_load_today: {
    en: 'House consumption today',
    fr: 'Consommation de la maison du jour',
    de: 'Hausverbrauch heute',
    es: 'Consumo de la casa de hoy',
  },
  feature_pv_index: {
    en: 'Solar production index',
    fr: 'Index de production solaire',
    de: 'Zählerstand Solarerzeugung',
    es: 'Índice de producción solar',
  },
  feature_grid_import_index: {
    en: 'Grid import index',
    fr: 'Index import réseau électrique',
    de: 'Zählerstand Netzbezug',
    es: 'Índice de importación de la red',
  },
  feature_grid_export_index: {
    en: 'Grid export index',
    fr: 'Index export réseau électrique',
    de: 'Zählerstand Netzeinspeisung',
    es: 'Índice de exportación a la red',
  },
  feature_battery_charge_index: {
    en: 'Battery charge index',
    fr: 'Index de charge de la batterie',
    de: 'Zählerstand Batterieladung',
    es: 'Índice de carga de la batería',
  },
  feature_battery_discharge_index: {
    en: 'Battery discharge index',
    fr: 'Index de décharge de la batterie',
    de: 'Zählerstand Batterieentladung',
    es: 'Índice de descarga de la batería',
  },
  feature_connector_status: {
    en: 'Connector status',
    fr: 'État du connecteur',
    de: 'Steckerstatus',
    es: 'Estado del conector',
  },
  feature_charging_state: {
    en: 'Charging state',
    fr: 'État de la charge',
    de: 'Ladezustand',
    es: 'Estado de la carga',
  },
  feature_power: {
    en: 'Charging power',
    fr: 'Puissance de recharge',
    de: 'Ladeleistung',
    es: 'Potencia de recarga',
  },

  // fields of the scene actions, in the errors
  field_period_1: { en: 'Period 1', fr: 'Plage 1', de: 'Zeitraum 1', es: 'Franja 1' },
  field_period_2: { en: 'Period 2', fr: 'Plage 2', de: 'Zeitraum 2', es: 'Franja 2' },
  field_max_soc: {
    en: 'Charge up to (%)',
    fr: 'Charger jusqu’à (%)',
    de: 'Laden bis (%)',
    es: 'Cargar hasta (%)',
  },
  field_cutoff_soc: {
    en: 'Cut-off SOC (%)',
    fr: 'SOC de coupure (%)',
    de: 'Entladegrenze (%)',
    es: 'SOC de corte (%)',
  },

  // connection status
  statusNoCredentials: {
    en: 'Enter the AppID and the AppSecret of your Alpha ESS developer account (open.alphaess.com) in the configuration.',
    fr: 'Saisissez l’AppID et l’AppSecret de votre compte développeur Alpha ESS (open.alphaess.com) dans la configuration.',
    de: 'Gib die AppID und das AppSecret deines Alpha-ESS-Entwicklerkontos (open.alphaess.com) in der Konfiguration ein.',
    es: 'Introduzca el AppID y el AppSecret de su cuenta de desarrollador Alpha ESS (open.alphaess.com) en la configuración.',
  },
  statusWaiting: {
    en: 'Connecting to Alpha ESS: the first readings come within a minute.',
    fr: 'Connexion à Alpha ESS : les premières lectures arrivent dans la minute.',
    de: 'Verbindung zu Alpha ESS: Die ersten Werte kommen innerhalb einer Minute.',
    es: 'Conectando con Alpha ESS: las primeras lecturas llegan en un minuto.',
  },
  statusNoSystem: {
    en: 'No system is bound to this AppID: add it on open.alphaess.com (serial number and CheckCode), or with the binding buttons.',
    fr: 'Aucun système n’est lié à cet AppID : ajoutez-le sur open.alphaess.com (numéro de série et CheckCode), ou avec les boutons de liaison.',
    de: 'Kein System ist mit dieser AppID verbunden: Füge es auf open.alphaess.com hinzu (Seriennummer und CheckCode) oder mit den Verknüpfungs-Schaltflächen.',
    es: 'Ningún sistema está vinculado a este AppID: añádalo en open.alphaess.com (número de serie y CheckCode) o con los botones de vinculación.',
  },
  statusOk: {
    en: '{count} system(s): {systems}.',
    fr: '{count} système(s) : {systems}.',
    de: '{count} System(e): {systems}.',
    es: '{count} sistema(s): {systems}.',
  },
  systemLine: {
    en: '{sn} {value}',
    fr: '{sn} {value}',
    de: '{sn} {value}',
    es: '{sn} {value}',
  },
  systemLineOffline: {
    en: '{sn} offline',
    fr: '{sn} hors ligne',
    de: '{sn} offline',
    es: '{sn} sin conexión',
  },
  statusPaused: {
    en: 'Alpha ESS asked to slow down (6053): readings paused for a minute.',
    fr: 'Alpha ESS demande de ralentir (6053) : lectures en pause une minute.',
    de: 'Alpha ESS bittet um weniger Anfragen (6053): Abfragen für eine Minute pausiert.',
    es: 'Alpha ESS pide ir más despacio (6053): lecturas en pausa un minuto.',
  },

  // errors
  errAuth: {
    en: 'Alpha ESS refuses the AppID or the AppSecret: copy both again from Development Management → Developer Information on open.alphaess.com.',
    fr: 'Alpha ESS refuse l’AppID ou l’AppSecret : recopiez-les depuis Development Management → Developer Information sur open.alphaess.com.',
    de: 'Alpha ESS lehnt die AppID oder das AppSecret ab: Kopiere beide erneut unter Development Management → Developer Information auf open.alphaess.com.',
    es: 'Alpha ESS rechaza el AppID o el AppSecret: cópielos de nuevo desde Development Management → Developer Information en open.alphaess.com.',
  },
  errClock: {
    en: 'Alpha ESS refuses the time of the request: the clock of the Gladys host is more than 5 minutes off.',
    fr: 'Alpha ESS refuse l’heure de la requête : l’horloge de la machine Gladys a plus de 5 minutes d’écart.',
    de: 'Alpha ESS lehnt die Uhrzeit der Anfrage ab: Die Uhr des Gladys-Rechners weicht um mehr als 5 Minuten ab.',
    es: 'Alpha ESS rechaza la hora de la petición: el reloj del equipo de Gladys tiene más de 5 minutos de desfase.',
  },
  errWhitelist: {
    en: 'Alpha ESS refuses the address of this Gladys: the IP allow-list of the developer account is on (Developer Information → IP White List).',
    fr: 'Alpha ESS refuse l’adresse de ce Gladys : la liste blanche d’IP du compte développeur est activée (Developer Information → IP White List).',
    de: 'Alpha ESS lehnt die Adresse dieses Gladys ab: Die IP-Whitelist des Entwicklerkontos ist aktiv (Developer Information → IP White List).',
    es: 'Alpha ESS rechaza la dirección de este Gladys: la lista blanca de IP de la cuenta de desarrollador está activada (Developer Information → IP White List).',
  },
  errNotBound: {
    en: 'System {sn} is not bound to this AppID: add it on open.alphaess.com, or with the binding buttons.',
    fr: 'Le système {sn} n’est pas lié à cet AppID : ajoutez-le sur open.alphaess.com, ou avec les boutons de liaison.',
    de: 'Das System {sn} ist nicht mit dieser AppID verbunden: Füge es auf open.alphaess.com oder mit den Verknüpfungs-Schaltflächen hinzu.',
    es: 'El sistema {sn} no está vinculado a este AppID: añádalo en open.alphaess.com o con los botones de vinculación.',
  },
  errRateLimit: {
    en: 'Alpha ESS refuses: too many requests, or this setting was already changed recently (about once a day is allowed). Try again later.',
    fr: 'Alpha ESS refuse : trop de requêtes, ou ce réglage a déjà été changé récemment (environ une fois par jour). Réessayez plus tard.',
    de: 'Alpha ESS lehnt ab: zu viele Anfragen, oder diese Einstellung wurde kürzlich schon geändert (etwa einmal pro Tag erlaubt). Versuche es später erneut.',
    es: 'Alpha ESS lo rechaza: demasiadas peticiones, o este ajuste ya se cambió hace poco (aproximadamente una vez al día). Vuelva a intentarlo más tarde.',
  },
  errOffline: {
    en: 'Alpha ESS says the system {sn} is offline: the inverter does not reach the cloud.',
    fr: 'Alpha ESS indique que le système {sn} est hors ligne : l’onduleur ne joint pas le cloud.',
    de: 'Alpha ESS meldet das System {sn} als offline: Der Wechselrichter erreicht die Cloud nicht.',
    es: 'Alpha ESS indica que el sistema {sn} está sin conexión: el inversor no llega a la nube.',
  },
  errForbidden: {
    en: 'Alpha ESS does not allow this operation for system {sn} (no permission for this model or account).',
    fr: 'Alpha ESS n’autorise pas cette opération pour le système {sn} (pas de droit pour ce modèle ou ce compte).',
    de: 'Alpha ESS erlaubt diesen Vorgang für das System {sn} nicht (keine Berechtigung für dieses Modell oder Konto).',
    es: 'Alpha ESS no permite esta operación para el sistema {sn} (sin permiso para este modelo o cuenta).',
  },
  errInvalid: {
    en: 'Alpha ESS refuses a value of the request (parameter error).',
    fr: 'Alpha ESS refuse une valeur de la requête (erreur de paramètre).',
    de: 'Alpha ESS lehnt einen Wert der Anfrage ab (Parameterfehler).',
    es: 'Alpha ESS rechaza un valor de la petición (error de parámetro).',
  },
  errSetFailed: {
    en: 'Alpha ESS could not apply the setting to system {sn} (set failed).',
    fr: 'Alpha ESS n’a pas pu appliquer le réglage au système {sn} (échec du réglage).',
    de: 'Alpha ESS konnte die Einstellung nicht auf das System {sn} anwenden.',
    es: 'Alpha ESS no pudo aplicar el ajuste al sistema {sn}.',
  },
  errServer: {
    en: 'Alpha ESS answers with an internal error: try again later.',
    fr: 'Alpha ESS répond par une erreur interne : réessayez plus tard.',
    de: 'Alpha ESS antwortet mit einem internen Fehler: Versuche es später erneut.',
    es: 'Alpha ESS responde con un error interno: vuelva a intentarlo más tarde.',
  },
  errUnreachable: {
    en: 'Alpha ESS cannot be reached (network or DNS of the Gladys host).',
    fr: 'Alpha ESS est injoignable (réseau ou DNS de la machine Gladys).',
    de: 'Alpha ESS ist nicht erreichbar (Netzwerk oder DNS des Gladys-Rechners).',
    es: 'No se puede contactar con Alpha ESS (red o DNS del equipo de Gladys).',
  },
  errCheckCode: {
    en: 'Alpha ESS refuses the CheckCode of system {sn}: it is on the label of the inverter.',
    fr: 'Alpha ESS refuse le CheckCode du système {sn} : il figure sur l’étiquette de l’onduleur.',
    de: 'Alpha ESS lehnt den CheckCode des Systems {sn} ab: Er steht auf dem Etikett des Wechselrichters.',
    es: 'Alpha ESS rechaza el CheckCode del sistema {sn}: figura en la etiqueta del inversor.',
  },
  errBindCode: {
    en: 'The verification code is wrong or expired: ask for a new one.',
    fr: 'Le code de vérification est faux ou expiré : demandez-en un nouveau.',
    de: 'Der Bestätigungscode ist falsch oder abgelaufen: Fordere einen neuen an.',
    es: 'El código de verificación es incorrecto o ha caducado: solicite uno nuevo.',
  },
  errFailed: {
    en: 'Alpha ESS request failed: {detail}',
    fr: 'La requête Alpha ESS a échoué : {detail}',
    de: 'Die Alpha-ESS-Anfrage ist fehlgeschlagen: {detail}',
    es: 'La petición a Alpha ESS ha fallado: {detail}',
  },
  errControlDisabled: {
    en: 'Control is off: tick "Allow the scenes to control the inverter" in the configuration of the integration first.',
    fr: 'Le pilotage est désactivé : cochez d’abord « Autoriser les scènes à piloter l’onduleur » dans la configuration de l’intégration.',
    de: 'Die Steuerung ist aus: Aktiviere zuerst „Szenen dürfen den Wechselrichter steuern“ in der Konfiguration der Integration.',
    es: 'El control está desactivado: active primero «Permitir que las escenas controlen el inversor» en la configuración de la integración.',
  },
  errNoBattery: {
    en: 'System {sn} has no battery.',
    fr: 'Le système {sn} n’a pas de batterie.',
    de: 'Das System {sn} hat keine Batterie.',
    es: 'El sistema {sn} no tiene batería.',
  },
  errNoCharger: {
    en: 'No Alpha ESS EV charger is known on this system.',
    fr: 'Aucune borne de recharge Alpha ESS n’est connue sur ce système.',
    de: 'Auf diesem System ist keine Alpha-ESS-Wallbox bekannt.',
    es: 'No se conoce ningún cargador Alpha ESS en este sistema.',
  },
  errNoSettings: {
    en: 'Alpha ESS did not give the current setting: nothing was sent.',
    fr: 'Alpha ESS n’a pas donné le réglage actuel : rien n’a été envoyé.',
    de: 'Alpha ESS hat die aktuelle Einstellung nicht geliefert: Nichts wurde gesendet.',
    es: 'Alpha ESS no ha dado el ajuste actual: no se ha enviado nada.',
  },
  errSoc: {
    en: '{field}: "{value}" is not a percentage from 10 to 100.',
    fr: '{field} : « {value} » n’est pas un pourcentage de 10 à 100.',
    de: '{field}: „{value}“ ist kein Prozentwert von 10 bis 100.',
    es: '{field}: «{value}» no es un porcentaje de 10 a 100.',
  },
  errSocUnknown: {
    en: '{field}: Alpha ESS gave no current value, enter one.',
    fr: '{field} : Alpha ESS n’a pas donné de valeur actuelle, saisissez-en une.',
    de: '{field}: Alpha ESS hat keinen aktuellen Wert geliefert, gib einen ein.',
    es: '{field}: Alpha ESS no ha dado un valor actual, introduzca uno.',
  },
  errPeriod: {
    en: '{field}: "{value}" is not a period like 01:00-05:00 on quarter hours (00:00 to 23:45), nor "off".',
    fr: '{field} : « {value} » n’est pas une plage comme 01:00-05:00 au quart d’heure (00:00 à 23:45), ni « off ».',
    de: '{field}: „{value}“ ist kein Zeitraum wie 01:00-05:00 in Viertelstunden (00:00 bis 23:45) und nicht „off“.',
    es: '{field}: «{value}» no es una franja como 01:00-05:00 en cuartos de hora (00:00 a 23:45), ni «off».',
  },
  errCommand: {
    en: 'Unknown command "{value}": start or stop.',
    fr: 'Commande inconnue « {value} » : démarrer ou arrêter.',
    de: 'Unbekannter Befehl „{value}“: starten oder stoppen.',
    es: 'Orden desconocida «{value}»: iniciar o detener.',
  },

  // scene results
  resultUnchanged: {
    en: 'Already set this way: nothing sent.',
    fr: 'Déjà réglé ainsi : rien n’a été envoyé.',
    de: 'Bereits so eingestellt: nichts gesendet.',
    es: 'Ya está así: no se ha enviado nada.',
  },
  resultGridCharge: {
    en: 'Charge from the grid of {sn}: {state}, {periods}, up to {soc} %.',
    fr: 'Charge depuis le réseau de {sn} : {state}, {periods}, jusqu’à {soc} %.',
    de: 'Netzladung von {sn}: {state}, {periods}, bis {soc} %.',
    es: 'Carga desde la red de {sn}: {state}, {periods}, hasta {soc} %.',
  },
  resultDischarge: {
    en: 'Discharge time control of {sn}: {state}, {periods}, cut-off {soc} %.',
    fr: 'Contrôle horaire de la décharge de {sn} : {state}, {periods}, coupure à {soc} %.',
    de: 'Zeitsteuerung der Entladung von {sn}: {state}, {periods}, Grenze {soc} %.',
    es: 'Control horario de descarga de {sn}: {state}, {periods}, corte al {soc} %.',
  },
  resultEvStart: {
    en: 'Start sent to the EV charger {sn}.',
    fr: 'Démarrage envoyé à la borne {sn}.',
    de: 'Start an die Wallbox {sn} gesendet.',
    es: 'Inicio enviado al cargador {sn}.',
  },
  resultEvStop: {
    en: 'Stop sent to the EV charger {sn}.',
    fr: 'Arrêt envoyé à la borne {sn}.',
    de: 'Stopp an die Wallbox {sn} gesendet.',
    es: 'Parada enviada al cargador {sn}.',
  },
  todaySummary: {
    en: 'Today: solar {pv} kWh, house {load} kWh, grid import {import} kWh, export {export} kWh, battery {soc}.',
    fr: 'Aujourd’hui : solaire {pv} kWh, maison {load} kWh, import réseau {import} kWh, export {export} kWh, batterie {soc}.',
    de: 'Heute: Solar {pv} kWh, Haus {load} kWh, Netzbezug {import} kWh, Einspeisung {export} kWh, Batterie {soc}.',
    es: 'Hoy: solar {pv} kWh, casa {load} kWh, importación {import} kWh, exportación {export} kWh, batería {soc}.',
  },

  // configuration buttons
  testOk: {
    en: 'Alpha ESS accepts the AppID: {count} system(s).',
    fr: 'Alpha ESS accepte l’AppID : {count} système(s).',
    de: 'Alpha ESS akzeptiert die AppID: {count} System(e).',
    es: 'Alpha ESS acepta el AppID: {count} sistema(s).',
  },
  testLine: {
    en: '{sn}: {model}, solar {pv} kW, no battery',
    fr: '{sn} : {model}, solaire {pv} kW, sans batterie',
    de: '{sn}: {model}, Solar {pv} kW, ohne Batterie',
    es: '{sn}: {model}, solar {pv} kW, sin batería',
  },
  testLineBattery: {
    en: '{sn}: {model}, solar {pv} kW, battery {capacity} kWh',
    fr: '{sn} : {model}, solaire {pv} kW, batterie {capacity} kWh',
    de: '{sn}: {model}, Solar {pv} kW, Batterie {capacity} kWh',
    es: '{sn}: {model}, solar {pv} kW, batería {capacity} kWh',
  },
  testNoSystem: {
    en: 'Alpha ESS accepts the AppID, but no system is bound to it yet: add it on open.alphaess.com, or with the binding buttons.',
    fr: 'Alpha ESS accepte l’AppID, mais aucun système n’y est encore lié : ajoutez-le sur open.alphaess.com, ou avec les boutons de liaison.',
    de: 'Alpha ESS akzeptiert die AppID, aber noch kein System ist damit verbunden: Füge es auf open.alphaess.com oder mit den Verknüpfungs-Schaltflächen hinzu.',
    es: 'Alpha ESS acepta el AppID, pero todavía no hay ningún sistema vinculado: añádalo en open.alphaess.com o con los botones de vinculación.',
  },
  bindFieldsMissing: {
    en: 'Enter the serial number of the system and the code (letters and digits only).',
    fr: 'Saisissez le numéro de série du système et le code (lettres et chiffres uniquement).',
    de: 'Gib die Seriennummer des Systems und den Code ein (nur Buchstaben und Ziffern).',
    es: 'Introduzca el número de serie del sistema y el código (solo letras y cifras).',
  },
  bindCodeSent: {
    en: 'Alpha ESS e-mailed a verification code to the owner of {sn}: enter it with "Bind the system".',
    fr: 'Alpha ESS a envoyé un code de vérification par e-mail au propriétaire de {sn} : saisissez-le avec « Lier le système ».',
    de: 'Alpha ESS hat dem Besitzer von {sn} einen Bestätigungscode per E-Mail geschickt: Gib ihn mit „System verknüpfen“ ein.',
    es: 'Alpha ESS ha enviado un código de verificación por correo al propietario de {sn}: introdúzcalo con «Vincular el sistema».',
  },
  bindDone: {
    en: 'System {sn} is bound to the AppID: its device comes in the Discovery within a minute.',
    fr: 'Le système {sn} est lié à l’AppID : son appareil arrive dans la découverte d’ici une minute.',
    de: 'Das System {sn} ist mit der AppID verbunden: Sein Gerät erscheint innerhalb einer Minute in der Suche.',
    es: 'El sistema {sn} está vinculado al AppID: su dispositivo aparece en la detección en un minuto.',
  },
  diagnosticDone: {
    en: 'State written to the logs of the integration ({count} line(s) "Alpha ESS diagnostic"), without the secret.',
    fr: 'État écrit dans les journaux de l’intégration ({count} ligne(s) « Alpha ESS diagnostic »), sans le secret.',
    de: 'Zustand in die Logs der Integration geschrieben ({count} Zeile(n) „Alpha ESS diagnostic“), ohne das Secret.',
    es: 'Estado escrito en los registros de la integración ({count} línea(s) «Alpha ESS diagnostic»), sin el secreto.',
  },

  // widgets
  captionBattery: {
    en: '{value} kWh',
    fr: '{value} kWh',
    de: '{value} kWh',
    es: '{value} kWh',
  },
  widgetWaiting: {
    en: 'Waiting for the first readings of Alpha ESS.',
    fr: 'En attente des premières lectures d’Alpha ESS.',
    de: 'Warte auf die ersten Werte von Alpha ESS.',
    es: 'Esperando las primeras lecturas de Alpha ESS.',
  },
  widgetOffline: {
    en: 'Alpha ESS says the system is offline: the inverter does not reach the cloud.',
    fr: 'Alpha ESS indique que le système est hors ligne : l’onduleur ne joint pas le cloud.',
    de: 'Alpha ESS meldet das System als offline: Der Wechselrichter erreicht die Cloud nicht.',
    es: 'Alpha ESS indica que el sistema está sin conexión: el inversor no llega a la nube.',
  },
  widgetNoBattery: {
    en: 'This system has no battery: no charge or discharge setting.',
    fr: 'Ce système n’a pas de batterie : aucun réglage de charge ou de décharge.',
    de: 'Dieses System hat keine Batterie: keine Lade- oder Entladeeinstellung.',
    es: 'Este sistema no tiene batería: ningún ajuste de carga o descarga.',
  },
  widgetScheduleWaiting: {
    en: 'The battery settings are read within the hour.',
    fr: 'Les réglages de la batterie sont lus dans l’heure.',
    de: 'Die Batterieeinstellungen werden innerhalb der Stunde gelesen.',
    es: 'Los ajustes de la batería se leen dentro de la hora.',
  },
  widgetScheduleRefused: {
    en: 'Alpha ESS does not give the battery settings of this system through the Open API.',
    fr: 'Alpha ESS ne donne pas les réglages de la batterie de ce système par l’Open API.',
    de: 'Alpha ESS liefert die Batterieeinstellungen dieses Systems nicht über die Open API.',
    es: 'Alpha ESS no da los ajustes de la batería de este sistema por la Open API.',
  },
  widgetCurveLoading: {
    en: 'The curve of the day is being read.',
    fr: 'La courbe du jour est en cours de lecture.',
    de: 'Die Tageskurve wird gelesen.',
    es: 'Se está leyendo la curva del día.',
  },
  widgetCurveSoon: {
    en: 'The curve of the day starts with the next readings.',
    fr: 'La courbe du jour commence avec les prochaines lectures.',
    de: 'Die Tageskurve beginnt mit den nächsten Werten.',
    es: 'La curva del día empieza con las próximas lecturas.',
  },
  tileBattery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  tileSolar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  tileHouse: { en: 'House', fr: 'Maison', de: 'Haus', es: 'Casa' },
  tileGrid: { en: 'Grid', fr: 'Réseau', de: 'Netz', es: 'Red' },
  tileGridImport: {
    en: 'From the grid',
    fr: 'Depuis le réseau',
    de: 'Aus dem Netz',
    es: 'Desde la red',
  },
  tileGridExport: {
    en: 'To the grid',
    fr: 'Vers le réseau',
    de: 'Ins Netz',
    es: 'Hacia la red',
  },
  tileCharging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  tileDischarging: {
    en: 'Discharging',
    fr: 'En décharge',
    de: 'Entlädt',
    es: 'Descargando',
  },
  tileBatteryIdle: {
    en: 'Battery idle',
    fr: 'Batterie au repos',
    de: 'Batterie ruht',
    es: 'Batería en reposo',
  },
  tileSolarToday: {
    en: 'Solar today',
    fr: 'Solaire du jour',
    de: 'Solar heute',
    es: 'Solar hoy',
  },
  tileHouseToday: {
    en: 'House today',
    fr: 'Maison du jour',
    de: 'Haus heute',
    es: 'Casa hoy',
  },
  tileImportToday: {
    en: 'Grid import',
    fr: 'Import réseau',
    de: 'Netzbezug',
    es: 'Importación',
  },
  tileExportToday: {
    en: 'Grid export',
    fr: 'Export réseau',
    de: 'Einspeisung',
    es: 'Exportación',
  },
  tileSelfSufficiency: {
    en: 'Self-sufficiency',
    fr: 'Autonomie',
    de: 'Autarkie',
    es: 'Autosuficiencia',
  },
  tileMaxSoc: { en: 'Max charge', fr: 'Charge max', de: 'Max. Ladung', es: 'Carga máx.' },
  tileCutoffSoc: { en: 'Cut-off', fr: 'Coupure', de: 'Entladegrenze', es: 'Corte' },
  seriesSolar: { en: 'Solar', fr: 'Solaire', de: 'Solar', es: 'Solar' },
  seriesHouse: { en: 'House', fr: 'Maison', de: 'Haus', es: 'Casa' },
  seriesImport: {
    en: 'Grid import',
    fr: 'Import réseau',
    de: 'Netzbezug',
    es: 'Importación',
  },
  seriesExport: {
    en: 'Grid export',
    fr: 'Export réseau',
    de: 'Einspeisung',
    es: 'Exportación',
  },
  chartToday: {
    en: 'Power today',
    fr: 'Puissances du jour',
    de: 'Leistung heute',
    es: 'Potencias de hoy',
  },
  rowReading: {
    en: 'Last reading',
    fr: 'Dernière lecture',
    de: 'Letzte Abfrage',
    es: 'Última lectura',
  },
  rowAgo: {
    en: '{time} ({ago})',
    fr: '{time} ({ago})',
    de: '{time} ({ago})',
    es: '{time} ({ago})',
  },
  rowNoReading: {
    en: 'none yet',
    fr: 'aucune pour l’instant',
    de: 'noch keine',
    es: 'ninguna todavía',
  },
  rowOffline: {
    en: 'offline since {time}',
    fr: 'hors ligne depuis {time}',
    de: 'offline seit {time}',
    es: 'sin conexión desde {time}',
  },
  rowSelfSufficiency: {
    en: 'Self-sufficiency today',
    fr: 'Autonomie du jour',
    de: 'Autarkie heute',
    es: 'Autosuficiencia de hoy',
  },
  rowBatteryToday: {
    en: 'Battery today',
    fr: 'Batterie du jour',
    de: 'Batterie heute',
    es: 'Batería hoy',
  },
  rowBatteryTodayValue: {
    en: '+{charge} / −{discharge} kWh',
    fr: '+{charge} / −{discharge} kWh',
    de: '+{charge} / −{discharge} kWh',
    es: '+{charge} / −{discharge} kWh',
  },
  rowGridCharge: {
    en: 'Charge from the grid',
    fr: 'Charge depuis le réseau',
    de: 'Laden aus dem Netz',
    es: 'Carga desde la red',
  },
  rowGridChargePeriods: {
    en: 'Charge periods',
    fr: 'Plages de charge',
    de: 'Ladezeiträume',
    es: 'Franjas de carga',
  },
  rowDischarge: {
    en: 'Discharge time control',
    fr: 'Contrôle horaire de décharge',
    de: 'Zeitsteuerung der Entladung',
    es: 'Control horario de descarga',
  },
  rowDischargePeriods: {
    en: 'Discharge periods',
    fr: 'Plages de décharge',
    de: 'Entladezeiträume',
    es: 'Franjas de descarga',
  },
  rowSceneControl: {
    en: 'Control from scenes',
    fr: 'Pilotage par les scènes',
    de: 'Steuerung durch Szenen',
    es: 'Control desde escenas',
  },
  rowSettingsRead: {
    en: 'Settings read at',
    fr: 'Réglages lus à',
    de: 'Einstellungen gelesen um',
    es: 'Ajustes leídos a las',
  },
  valueOn: { en: 'on', fr: 'activé', de: 'an', es: 'activado' },
  valueOff: { en: 'off', fr: 'désactivé', de: 'aus', es: 'desactivado' },
  valueAllowed: { en: 'allowed', fr: 'autorisé', de: 'erlaubt', es: 'permitido' },
  valueDisabled: {
    en: 'not allowed',
    fr: 'non autorisé',
    de: 'nicht erlaubt',
    es: 'no permitido',
  },
  periodsNone: { en: 'none', fr: 'aucune', de: 'keiner', es: 'ninguna' },

  // durations
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is a language of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, with its values.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The values of the `{placeholders}`.
 * @returns {string} The text, the key itself when unknown.
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string|Function} key - A TEXTS key, or `(language) => text`.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function'
        ? key(language)
        : t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description How long ago an instant was: "just now", "12 min ago", "3 h ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) {
    return t('never', language);
  }
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) {
    return t('justNow', language);
  }
  if (minutes < 60) {
    return t('minutesAgo', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('hoursAgo', language, { n: hours });
  }
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

/**
 * @description A number in the format of a language.
 * @param {number} value - The number.
 * @param {string} language - The language.
 * @param {number} [decimals] - The decimals at most.
 * @returns {string} "12,5" in French.
 */
function formatNumber(value, language, decimals = 1) {
  if (!Number.isFinite(value)) {
    return '–';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: decimals,
  }).format(value);
}

export { LANGUAGES, TEXTS, isLanguage, t, all, ago, formatNumber };
