# Alpha ESS

## Presentación

Esta integración trae a Gladys los inversores híbridos, baterías y cargadores de vehículo eléctrico Alpha ESS de su cuenta, mediante la [Open API oficial de Alpha ESS](https://open.alphaess.com) y su propia cuenta de desarrollador. No está afiliada a Alpha ESS.

- Un dispositivo por sistema: potencia solar, nivel de batería, potencias de carga y descarga, potencia de red (importación +, exportación −), consumo de la casa, energías del día e índices de energía.
- Un dispositivo por cargador Alpha ESS: estado del conector, estado de la carga, potencia.
- Tres widgets de panel: flujo de energía ahora, hoy (con la curva de potencia del día), programación de la batería.
- Disparadores de escena: batería llena, batería en el corte, empieza la exportación o la importación, sistema sin conexión o de vuelta, estado del cargador, acceso denegado.
- Acciones de escena: carga desde la red, control horario de descarga, iniciar o detener el cargador (desactivadas mientras no las permita), energías de hoy.

Transporte: nube. Su AppID, los números de serie de sus sistemas y los ajustes que cambian sus escenas van a la nube de Alpha ESS (`openapi.alphaess.com`); el AppSecret nunca sale de Gladys (solo una firma de cada petición).

## Requisitos previos

- Gladys Assistant 5.1.0 o posterior.
- Un sistema Alpha ESS que envía sus datos a la nube de Alpha ESS (aparece en la aplicación Alpha ESS).
- **Una cuenta de desarrollador** (gratuita) en [open.alphaess.com](https://open.alphaess.com). En **Development Management → Developer Information**, copie el **Developer ID (AppID)** y el **Developer Secret (AppSecret)**.
- **Su sistema vinculado al AppID**: en el portal, añada el sistema con su **número de serie (SN)** y su **CheckCode**, ambos en la etiqueta del inversor (o facilitados por su instalador). Si el portal nunca envía el correo de confirmación, use los botones de vinculación de la configuración (ver más abajo).

El ritmo: Alpha ESS pide **al menos 10 segundos entre dos peticiones** y si no responde «demasiado rápido» (6053). La integración envía una petición cada vez, separadas 10 segundos, y va más despacio por sí misma cuando Alpha ESS lo pide.

## Configuración

| Campo                                          | Significado                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AppID (Developer ID)                           | El Developer ID del portal, empieza por `alpha`                                                   |
| AppSecret (Developer Secret)                   | El Developer Secret del portal (un secreto, nunca se vuelve a mostrar ni se escribe en registros) |
| Permitir que las escenas controlen el inversor | Desactivado por defecto; activado, las acciones de escena pueden cambiar la batería y el cargador |
| Lectura de la potencia                         | Cada 30 s, 1 min (por defecto), 2 min o 5 min; espaciada con varios sistemas                      |
| Idioma de los textos                           | Nombres de las funciones, textos de escenas y errores; automático sigue el último widget          |

Botones:

- **Probar la conexión** lista los sistemas vinculados al AppID (número de serie, modelo, potencia solar, tamaño de la batería).
- **Solicitar un código de vinculación** (número de serie + CheckCode): Alpha ESS envía un código de verificación por correo al propietario del sistema. **Vincular el sistema** (número de serie + código) lo vincula a su AppID. Su dispositivo aparece después en la detección.
- **Diagnóstico** escribe el estado de la integración en sus registros, sin el secreto.

## Uso

### Dispositivos

Abra **Descubrir** y añada sus sistemas. Un dispositivo de sistema tiene:

- **Producción solar** (W), **Consumo de la casa** (W), **Red eléctrica** (W, positiva al importar, negativa al exportar);
- con batería: **Nivel de batería** (%), **Potencia de carga** y **Potencia de descarga** (W, ambas positivas);
- **Producción solar de hoy** y **Consumo de la casa de hoy** (kWh);
- **índices** (kWh): producción solar, importación de la red, exportación a la red y, con batería, carga y descarga de la batería.

La Open API da las energías de cada día, no el contador del inversor: la integración suma los días ella misma. Los índices empiezan en 0 el primer día en que funciona la integración, nunca bajan y se corrigen después de medianoche con el final del día anterior. Son índices de historial: ninguno cuenta como consumo de su casa, así que un contador inteligente sigue alimentando solo el panel de energía, sin doble conteo.

Un dispositivo cargador tiene su **Estado del conector**, su **Estado de la carga** y su **Potencia de recarga** (W).

### Widgets del panel

![Los tres widgets: flujo de energía ahora, hoy con la curva de potencia, programación de la batería (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-alpha-ess/main/docs/assets/widgets.es.png)

- **Alpha ESS ahora**: nivel de batería, solar, casa, red (hacia o desde), batería (cargando o descargando), la hora de lectura y la autosuficiencia del día; «sin conexión desde…» en rojo cuando Alpha ESS indica el sistema sin conexión.
- **Alpha ESS hoy**: solar, casa, importación y exportación del día, autosuficiencia, la curva de potencia del día (leída solo mientras se muestra el widget), la batería cargada y descargada.
- **Programación batería**: la carga desde la red (activada o no, franjas, hasta qué SOC) y el control horario de descarga (activado o no, franjas, SOC de corte) guardados en la nube, y si sus escenas pueden cambiarlos.

Elija el sistema en los ajustes del widget (vacío: el primero).

### Escenas

Disparadores (una vez por cambio, nunca en la primera lectura):

- **Alpha ESS: batería llena**: la batería llega al 100 % (de nuevo tras bajar del 95 %).
- **Alpha ESS: batería en el corte**: la batería llega al SOC de corte de la descarga (+1 punto).
- **Alpha ESS: empieza la exportación a la red** / **empieza la importación de la red**: 200 W o más, dos lecturas seguidas.
- **Alpha ESS: sistema sin conexión** (10 minutos) / **sistema de nuevo en línea**.
- **Alpha ESS: cambia el estado del cargador**: conectado, cargando, en pausa, terminado, avería; filtro sobre el nuevo estado.
- **Alpha ESS: acceso denegado**: AppID o AppSecret rechazado, reloj del equipo desfasado, IP no permitida o sistema no vinculado.

Acciones (las tres primeras requieren **Permitir que las escenas controlen el inversor**):

- **Alpha ESS: carga desde la red**: activada, desactivada o sin cambios, dos franjas como `01:00-05:00` (cuartos de hora, `off` para vaciar una), el SOC en el que se detiene (10 a 100). Los campos vacíos conservan su valor. Primero se lee el ajuste actual y se escribe el ajuste completo; no se envía nada si nada cambia.
- **Alpha ESS: control horario de descarga**: lo mismo para la descarga, con su SOC de corte.
- **Alpha ESS: iniciar o detener el cargador**.
- **Alpha ESS: energías de hoy**: solar, casa, importación, exportación, batería cargada y descargada, autosuficiencia, nivel de batería y una frase, sin ninguna petición.

Alpha ESS documenta los dos ajustes de batería como modificables **aproximadamente una vez al día**: un segundo cambio el mismo día puede ser rechazado. En algunos inversores recientes (SMILE-G3) la aplicación guarda su programación en otro lugar y estos ajustes pueden ignorarse: compruebe el resultado en la aplicación Alpha ESS antes de confiar en él.

Ejemplos:

1. Cada día a las 22:00, si la batería está por debajo del 40 % → **Alpha ESS: carga desde la red** activada, franja `01:00-05:00`, hasta el 80 %; a las 06:00 → desactivada.
2. Cuando **Alpha ESS: empieza la exportación a la red** → encender el calentador de agua; cuando **empieza la importación de la red** → apagarlo.
3. Cuando **Alpha ESS: sistema sin conexión** → enviar una notificación «El inversor lleva {{triggerEvent.data.minutes_offline}} min sin conexión».
4. Cada tarde a las 21:00 → **Alpha ESS: energías de hoy** → enviar un mensaje con su salida `summary`.

## Solución de problemas

- **«Alpha ESS rechaza el AppID o el AppSecret»** (6007): cópielos de nuevo desde Developer Information, sin espacios antes ni después.
- **«El sistema … no está vinculado a este AppID»** (6005): vincúlelo en el portal, o con **Solicitar un código de vinculación** y luego **Vincular el sistema**.
- **«El reloj del equipo de Gladys tiene más de 5 minutos de desfase»** (6006): ponga en hora el equipo (NTP).
- **«La lista blanca de IP de la cuenta de desarrollador está activada»** (6009): añada la dirección pública de su Gladys, o desactive la lista.
- **«Alpha ESS pide ir más despacio»** (6053): quizá otra aplicación (Home Assistant…) usa el mismo AppID; las lecturas se reanudan tras un minuto.
- **«El control está desactivado»**: active **Permitir que las escenas controlen el inversor**.
- **Un ajuste cambiado pero el inversor no hace nada**: Alpha ESS lo aceptó en la nube; en algunos modelos gana la programación de la aplicación. Compruébelo en la aplicación Alpha ESS.
- **«Alpha ESS no da los ajustes de la batería de este sistema»** (6017): su modelo o su cuenta no tiene acceso a ellos por la Open API.
- Informe de un problema en GitHub con las versiones de Gladys y de la integración, el modelo del inversor, el mensaje de **Probar la conexión** y las líneas escritas por **Diagnóstico**. Nunca pegue su AppSecret.
