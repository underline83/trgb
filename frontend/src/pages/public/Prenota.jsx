// @version: v2.0 — veste del sito (EB Garamond + Courier Prime serviti da TRGB, carta/inchiostro/ottone), 6 lingue, solo orari liberi + lista d'attesa, titolo facoltativo, giorni pieni apribili per la lista (2026-11-28, Prenotazioni fase 3, proposta A); v1.3 — mesi senza limite di anticipo (2026-11-27); v1.2 — PrenotaIncorporata: il widget dentro altre pagine pubbliche (gift card /regalo), con nota precompilata (2026-10-25); v1.1 — indirizzo dedicato prenota.<dominio>: API sullo stesso indirizzo (/api/public/prenota); v1.0 — prenotazioni dal sito (2026-10-20, mig 205)
// Modulo: prenotazioni — [core]
// Pagina pubblica /prenota (anche dentro il sito in iframe) e /prenota/annulla/:token.
// Senza login: usa fetch diretto. Se nel browser c'è il token di un admin lo manda,
// così l'anteprima funziona anche quando il widget non è ancora attivo.
// In iframe comunica l'altezza al sito (postMessage «trgb-prenota-altezza»).
// I passi e i controlli sono quelli del percorso unico (prenotazioni_inserimento_service):
// il cliente vede solo gli orari dove si entra; per gli altri del turno può mettersi in lista d'attesa.
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../../config/api";

const LINGUE = ["it", "en", "fr", "de", "es", "uk"];

const T = {
  it: {
    locale: "it-IT",
    titolo: "Prenota un tavolo", persone: "Quante persone?", altro: "Di più", giorno: "Che giorno?", orario: "A che ora?",
    pranzo: "Pranzo", cena: "Cena", dati: "I tuoi dati", nome: "Nome", cognome: "Cognome", telefono: "Telefono",
    telefonoAiuto: "Se il numero non è italiano, scrivilo col prefisso del paese (+44…).",
    sig: [["mr", "Sig."], ["mrs", "Sig.ra"]],
    email: "Email", occasione: "Occasione (facoltativa)", allergie: "Allergie o intolleranze", note: "Note per noi",
    privacy: "Acconsento al trattamento dei miei dati per gestire la prenotazione.",
    prenota: "Prenota", richiedi: "Invia la richiesta", attesaBtn: "Mettimi in lista d'attesa", invio: "Invio…",
    richiestaInfo: (n) => `Per ${n} persone o più la prenotazione è una richiesta: te la confermiamo noi, di solito entro poche ore.`,
    gruppo: (tel) => `Per gruppi così numerosi chiamaci${tel ? ` al ${tel}` : ""}: troviamo insieme la soluzione.`,
    nessunOrario: "In questo giorno non c'è servizio.", scegliGiorno: "Scegli un giorno sul calendario.",
    chiuso: "chiuso", pieno: "completo",
    altroOrario: "Vuoi un altro orario?", attesaLink: "Mettiti in lista d'attesa",
    attesaInfo: "Scegli l'ora che preferisci: se si libera un posto ti contattiamo noi. Il tavolo non è ancora tuo.",
    attesaPieno: "Questo giorno è al completo. Puoi metterti in lista d'attesa:",
    torna: "Torna agli orari liberi",
    fattoTitolo: "Prenotazione confermata", fattoTesto: "Ti abbiamo mandato un'email di conferma. Ci vediamo",
    richiestaTitolo: "Richiesta inviata", richiestaTesto: "Ti abbiamo mandato un'email: ti confermiamo noi la prenotazione per",
    attesaTitolo: "Sei in lista d'attesa", attesaTesto: "Ti abbiamo mandato un'email. Se si libera un posto ti contattiamo noi per",
    altra: "Fai un'altra prenotazione",
    errori: {
      nome: "Scrivi nome e cognome.", telefono: "Il numero di telefono non sembra giusto.", email: "L'indirizzo email non sembra giusto.",
      privacy: "Serve il consenso per gestire la prenotazione.", occupato: "Quell'orario si è appena riempito: scegline un altro.",
      gruppo: "Per gruppi così numerosi chiamaci.", chiuso: "In quel giorno siamo chiusi.", troppe: "Troppi tentativi: riprova fra qualche minuto.",
      generico: "Qualcosa non ha funzionato. Riprova.", rete: "Connessione assente. Riprova.",
    },
    nonAttive: "Le prenotazioni online non sono ancora attive.", chiamaci: (tel) => (tel ? `Chiamaci al ${tel}.` : ""),
    anteprima: "Anteprima: le prenotazioni online non sono attive, la vedi solo tu perché sei entrato nel gestionale.",
    occasioni: ["", "Compleanno", "Anniversario", "Cena di lavoro", "Altro"],
    mesi: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    gg: ["L", "M", "M", "G", "V", "S", "D"],
    annullaTitolo: "Annulla la prenotazione", annulla: "Annulla la prenotazione", annullata: "La prenotazione è annullata. Speriamo di vederti presto.",
    nonAnnullabile: "Questa prenotazione non si può più annullare online.", nonTrovata: "Prenotazione non trovata.",
    pers: (n) => (n === 1 ? "1 persona" : `${n} persone`), alle: "alle",
  },
  en: {
    locale: "en-GB",
    titolo: "Book a table", persone: "How many guests?", altro: "More", giorno: "Which day?", orario: "What time?",
    pranzo: "Lunch", cena: "Dinner", dati: "Your details", nome: "First name", cognome: "Last name", telefono: "Phone",
    telefonoAiuto: "If your number is not Italian, please include the country code (+44…).",
    sig: [["mr", "Mr"], ["mrs", "Mrs"]],
    email: "Email", occasione: "Occasion (optional)", allergie: "Allergies or intolerances", note: "Notes for us",
    privacy: "I agree to the processing of my data to manage the booking.",
    prenota: "Book", richiedi: "Send request", attesaBtn: "Put me on the waiting list", invio: "Sending…",
    richiestaInfo: (n) => `For ${n} guests or more the booking is a request: we will confirm it, usually within a few hours.`,
    gruppo: (tel) => `For large groups please call us${tel ? ` on ${tel}` : ""} and we will find a solution together.`,
    nessunOrario: "We are not open on this day.", scegliGiorno: "Pick a day on the calendar.",
    chiuso: "closed", pieno: "full",
    altroOrario: "Would you like another time?", attesaLink: "Join the waiting list",
    attesaInfo: "Choose the time you prefer: if a table becomes free we will get in touch. The table is not yours yet.",
    attesaPieno: "This day is fully booked. You can join the waiting list:",
    torna: "Back to available times",
    fattoTitolo: "Booking confirmed", fattoTesto: "We have sent you a confirmation email. See you",
    richiestaTitolo: "Request sent", richiestaTesto: "We have sent you an email: we will confirm your booking for",
    attesaTitolo: "You are on the waiting list", attesaTesto: "We have sent you an email. If a table becomes free we will get in touch about",
    altra: "Make another booking",
    errori: {
      nome: "Please enter first and last name.", telefono: "The phone number does not look right.", email: "The email address does not look right.",
      privacy: "We need your consent to manage the booking.", occupato: "That time has just filled up: please choose another.",
      gruppo: "For large groups please call us.", chiuso: "We are closed on that day.", troppe: "Too many attempts: please try again in a few minutes.",
      generico: "Something went wrong. Please try again.", rete: "No connection. Please try again.",
    },
    nonAttive: "Online booking is not available yet.", chiamaci: (tel) => (tel ? `Call us on ${tel}.` : ""),
    anteprima: "Preview: online booking is not active, only you can see it because you are logged in.",
    occasioni: ["", "Birthday", "Anniversary", "Business dinner", "Other"],
    mesi: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    gg: ["M", "T", "W", "T", "F", "S", "S"],
    annullaTitolo: "Cancel your booking", annulla: "Cancel the booking", annullata: "Your booking has been cancelled. We hope to see you soon.",
    nonAnnullabile: "This booking can no longer be cancelled online.", nonTrovata: "Booking not found.",
    pers: (n) => (n === 1 ? "1 guest" : `${n} guests`), alle: "at",
  },
  fr: {
    locale: "fr-FR",
    titolo: "Réserver une table", persone: "Combien de personnes ?", altro: "Plus", giorno: "Quel jour ?", orario: "À quelle heure ?",
    pranzo: "Déjeuner", cena: "Dîner", dati: "Vos coordonnées", nome: "Prénom", cognome: "Nom", telefono: "Téléphone",
    telefonoAiuto: "Si votre numéro n'est pas italien, indiquez l'indicatif du pays (+33…).",
    sig: [["mr", "M."], ["mrs", "Mme"]],
    email: "E-mail", occasione: "Occasion (facultatif)", allergie: "Allergies ou intolérances", note: "Une remarque pour nous",
    privacy: "J'accepte le traitement de mes données pour la gestion de la réservation.",
    prenota: "Réserver", richiedi: "Envoyer la demande", attesaBtn: "M'inscrire sur la liste d'attente", invio: "Envoi…",
    richiestaInfo: (n) => `À partir de ${n} personnes, la réservation est une demande : nous vous la confirmons, en général sous quelques heures.`,
    gruppo: (tel) => `Pour les groupes aussi nombreux, appelez-nous${tel ? ` au ${tel}` : ""} : nous trouverons ensemble une solution.`,
    nessunOrario: "Nous ne sommes pas ouverts ce jour-là.", scegliGiorno: "Choisissez un jour dans le calendrier.",
    chiuso: "fermé", pieno: "complet",
    altroOrario: "Vous souhaitez un autre horaire ?", attesaLink: "Inscrivez-vous sur la liste d'attente",
    attesaInfo: "Choisissez l'heure qui vous convient : si une table se libère, nous vous contactons. La table n'est pas encore à vous.",
    attesaPieno: "Ce jour est complet. Vous pouvez vous inscrire sur la liste d'attente :",
    torna: "Revenir aux horaires disponibles",
    fattoTitolo: "Réservation confirmée", fattoTesto: "Nous vous avons envoyé un e-mail de confirmation. À bientôt,",
    richiestaTitolo: "Demande envoyée", richiestaTesto: "Nous vous avons envoyé un e-mail : nous vous confirmerons la réservation pour",
    attesaTitolo: "Vous êtes sur la liste d'attente", attesaTesto: "Nous vous avons envoyé un e-mail. Si une table se libère, nous vous contactons pour",
    altra: "Faire une autre réservation",
    errori: {
      nome: "Indiquez votre prénom et votre nom.", telefono: "Le numéro de téléphone ne semble pas correct.", email: "L'adresse e-mail ne semble pas correcte.",
      privacy: "Votre accord est nécessaire pour gérer la réservation.", occupato: "Cet horaire vient d'être complet : choisissez-en un autre.",
      gruppo: "Pour les groupes aussi nombreux, appelez-nous.", chiuso: "Nous sommes fermés ce jour-là.", troppe: "Trop de tentatives : réessayez dans quelques minutes.",
      generico: "Une erreur est survenue. Réessayez.", rete: "Pas de connexion. Réessayez.",
    },
    nonAttive: "La réservation en ligne n'est pas encore disponible.", chiamaci: (tel) => (tel ? `Appelez-nous au ${tel}.` : ""),
    anteprima: "Aperçu : la réservation en ligne n'est pas active.",
    occasioni: ["", "Anniversaire", "Anniversaire de mariage", "Dîner d'affaires", "Autre"],
    mesi: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    gg: ["L", "M", "M", "J", "V", "S", "D"],
    annullaTitolo: "Annuler la réservation", annulla: "Annuler la réservation", annullata: "La réservation est annulée. Nous espérons vous voir bientôt.",
    nonAnnullabile: "Cette réservation ne peut plus être annulée en ligne.", nonTrovata: "Réservation introuvable.",
    pers: (n) => (n === 1 ? "1 personne" : `${n} personnes`), alle: "à",
  },
  de: {
    locale: "de-DE",
    titolo: "Tisch reservieren", persone: "Wie viele Personen?", altro: "Mehr", giorno: "An welchem Tag?", orario: "Um wie viel Uhr?",
    pranzo: "Mittagessen", cena: "Abendessen", dati: "Ihre Angaben", nome: "Vorname", cognome: "Nachname", telefono: "Telefon",
    telefonoAiuto: "Wenn Ihre Nummer nicht italienisch ist, bitte mit Ländervorwahl angeben (+49…).",
    sig: [["mr", "Herr"], ["mrs", "Frau"]],
    email: "E-Mail", occasione: "Anlass (optional)", allergie: "Allergien oder Unverträglichkeiten", note: "Hinweise für uns",
    privacy: "Ich stimme der Verarbeitung meiner Daten zur Bearbeitung der Reservierung zu.",
    prenota: "Reservieren", richiedi: "Anfrage senden", attesaBtn: "Auf die Warteliste setzen", invio: "Wird gesendet…",
    richiestaInfo: (n) => `Ab ${n} Personen ist die Reservierung eine Anfrage: Wir bestätigen sie Ihnen, meist innerhalb weniger Stunden.`,
    gruppo: (tel) => `Für so große Gruppen rufen Sie uns bitte an${tel ? ` (${tel})` : ""}: Gemeinsam finden wir eine Lösung.`,
    nessunOrario: "An diesem Tag haben wir geschlossen.", scegliGiorno: "Wählen Sie einen Tag im Kalender.",
    chiuso: "geschlossen", pieno: "ausgebucht",
    altroOrario: "Lieber eine andere Uhrzeit?", attesaLink: "Auf die Warteliste",
    attesaInfo: "Wählen Sie Ihre Wunschzeit: Wird ein Tisch frei, melden wir uns. Der Tisch ist noch nicht für Sie reserviert.",
    attesaPieno: "Dieser Tag ist ausgebucht. Sie können sich auf die Warteliste setzen:",
    torna: "Zurück zu den freien Zeiten",
    fattoTitolo: "Reservierung bestätigt", fattoTesto: "Wir haben Ihnen eine Bestätigung per E-Mail geschickt. Bis",
    richiestaTitolo: "Anfrage gesendet", richiestaTesto: "Wir haben Ihnen eine E-Mail geschickt: Wir bestätigen Ihre Reservierung für",
    attesaTitolo: "Sie stehen auf der Warteliste", attesaTesto: "Wir haben Ihnen eine E-Mail geschickt. Wird ein Tisch frei, melden wir uns wegen",
    altra: "Weitere Reservierung",
    errori: {
      nome: "Bitte Vor- und Nachnamen angeben.", telefono: "Die Telefonnummer scheint nicht zu stimmen.", email: "Die E-Mail-Adresse scheint nicht zu stimmen.",
      privacy: "Wir benötigen Ihre Zustimmung, um die Reservierung zu bearbeiten.", occupato: "Diese Uhrzeit ist gerade ausgebucht: Bitte wählen Sie eine andere.",
      gruppo: "Für so große Gruppen rufen Sie uns bitte an.", chiuso: "An diesem Tag haben wir geschlossen.", troppe: "Zu viele Versuche: Bitte in ein paar Minuten erneut versuchen.",
      generico: "Etwas ist schiefgelaufen. Bitte erneut versuchen.", rete: "Keine Verbindung. Bitte erneut versuchen.",
    },
    nonAttive: "Online-Reservierungen sind noch nicht möglich.", chiamaci: (tel) => (tel ? `Rufen Sie uns an: ${tel}.` : ""),
    anteprima: "Vorschau: Online-Reservierungen sind nicht aktiv.",
    occasioni: ["", "Geburtstag", "Jahrestag", "Geschäftsessen", "Sonstiges"],
    mesi: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    gg: ["M", "D", "M", "D", "F", "S", "S"],
    annullaTitolo: "Reservierung stornieren", annulla: "Reservierung stornieren", annullata: "Die Reservierung ist storniert. Wir hoffen, Sie bald zu sehen.",
    nonAnnullabile: "Diese Reservierung kann nicht mehr online storniert werden.", nonTrovata: "Reservierung nicht gefunden.",
    pers: (n) => (n === 1 ? "1 Person" : `${n} Personen`), alle: "um",
  },
  es: {
    locale: "es-ES",
    titolo: "Reservar una mesa", persone: "¿Cuántas personas?", altro: "Más", giorno: "¿Qué día?", orario: "¿A qué hora?",
    pranzo: "Comida", cena: "Cena", dati: "Tus datos", nome: "Nombre", cognome: "Apellido", telefono: "Teléfono",
    telefonoAiuto: "Si tu número no es italiano, escríbelo con el prefijo del país (+34…).",
    sig: [["mr", "Sr."], ["mrs", "Sra."]],
    email: "Correo electrónico", occasione: "Ocasión (opcional)", allergie: "Alergias o intolerancias", note: "Notas para nosotros",
    privacy: "Acepto el tratamiento de mis datos para gestionar la reserva.",
    prenota: "Reservar", richiedi: "Enviar la solicitud", attesaBtn: "Apuntarme en la lista de espera", invio: "Enviando…",
    richiestaInfo: (n) => `A partir de ${n} personas la reserva es una solicitud: te la confirmamos nosotros, normalmente en pocas horas.`,
    gruppo: (tel) => `Para grupos tan numerosos llámanos${tel ? ` al ${tel}` : ""}: buscaremos juntos una solución.`,
    nessunOrario: "Ese día no abrimos.", scegliGiorno: "Elige un día en el calendario.",
    chiuso: "cerrado", pieno: "completo",
    altroOrario: "¿Prefieres otra hora?", attesaLink: "Apúntate en la lista de espera",
    attesaInfo: "Elige la hora que prefieras: si se libera una mesa te avisamos. La mesa todavía no es tuya.",
    attesaPieno: "Este día está completo. Puedes apuntarte en la lista de espera:",
    torna: "Volver a las horas libres",
    fattoTitolo: "Reserva confirmada", fattoTesto: "Te hemos enviado un correo de confirmación. Nos vemos el",
    richiestaTitolo: "Solicitud enviada", richiestaTesto: "Te hemos enviado un correo: te confirmaremos la reserva para el",
    attesaTitolo: "Estás en la lista de espera", attesaTesto: "Te hemos enviado un correo. Si se libera una mesa te avisamos para el",
    altra: "Hacer otra reserva",
    errori: {
      nome: "Escribe nombre y apellido.", telefono: "El número de teléfono no parece correcto.", email: "La dirección de correo no parece correcta.",
      privacy: "Necesitamos tu consentimiento para gestionar la reserva.", occupato: "Esa hora acaba de llenarse: elige otra.",
      gruppo: "Para grupos tan numerosos llámanos.", chiuso: "Ese día estamos cerrados.", troppe: "Demasiados intentos: inténtalo de nuevo en unos minutos.",
      generico: "Algo no ha funcionado. Inténtalo de nuevo.", rete: "Sin conexión. Inténtalo de nuevo.",
    },
    nonAttive: "Las reservas en línea todavía no están disponibles.", chiamaci: (tel) => (tel ? `Llámanos al ${tel}.` : ""),
    anteprima: "Vista previa: las reservas en línea no están activas.",
    occasioni: ["", "Cumpleaños", "Aniversario", "Cena de trabajo", "Otra"],
    mesi: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    gg: ["L", "M", "X", "J", "V", "S", "D"],
    annullaTitolo: "Cancelar la reserva", annulla: "Cancelar la reserva", annullata: "La reserva está cancelada. Esperamos verte pronto.",
    nonAnnullabile: "Esta reserva ya no se puede cancelar en línea.", nonTrovata: "Reserva no encontrada.",
    pers: (n) => (n === 1 ? "1 persona" : `${n} personas`), alle: "a las",
  },
  uk: {
    locale: "uk-UA",
    titolo: "Забронювати столик", persone: "Скільки осіб?", altro: "Більше", giorno: "Який день?", orario: "О котрій?",
    pranzo: "Обід", cena: "Вечеря", dati: "Ваші дані", nome: "Ім'я", cognome: "Прізвище", telefono: "Телефон",
    telefonoAiuto: "Якщо номер не італійський, вкажіть код країни (+380…).",
    sig: [["mr", "Пан"], ["mrs", "Пані"]],
    email: "Ел. пошта", occasione: "Привід (необов'язково)", allergie: "Алергії або непереносимість", note: "Побажання для нас",
    privacy: "Я погоджуюся на обробку моїх даних для оформлення бронювання.",
    prenota: "Забронювати", richiedi: "Надіслати запит", attesaBtn: "Додати мене до листа очікування", invio: "Надсилаємо…",
    richiestaInfo: (n) => `Для ${n} і більше осіб бронювання є запитом: ми підтвердимо його, зазвичай протягом кількох годин.`,
    gruppo: (tel) => `Для таких великих груп зателефонуйте нам${tel ? `: ${tel}` : ""} — разом знайдемо рішення.`,
    nessunOrario: "Цього дня ми не працюємо.", scegliGiorno: "Оберіть день у календарі.",
    chiuso: "зачинено", pieno: "немає місць",
    altroOrario: "Хочете інший час?", attesaLink: "Станьте в лист очікування",
    attesaInfo: "Оберіть зручний час: якщо звільниться столик, ми з вами зв'яжемося. Столик ще не заброньований.",
    attesaPieno: "На цей день місць немає. Ви можете стати в лист очікування:",
    torna: "Повернутися до вільного часу",
    fattoTitolo: "Бронювання підтверджено", fattoTesto: "Ми надіслали вам підтвердження на ел. пошту. Чекаємо на вас",
    richiestaTitolo: "Запит надіслано", richiestaTesto: "Ми надіслали вам лист: ми підтвердимо бронювання на",
    attesaTitolo: "Ви в листі очікування", attesaTesto: "Ми надіслали вам лист. Якщо звільниться столик, ми зв'яжемося з вами щодо",
    altra: "Нове бронювання",
    errori: {
      nome: "Вкажіть ім'я та прізвище.", telefono: "Номер телефону виглядає неправильно.", email: "Адреса ел. пошти виглядає неправильно.",
      privacy: "Потрібна ваша згода для оформлення бронювання.", occupato: "Цей час щойно зайняли: оберіть інший.",
      gruppo: "Для таких великих груп зателефонуйте нам.", chiuso: "Цього дня ми зачинені.", troppe: "Забагато спроб: спробуйте за кілька хвилин.",
      generico: "Щось пішло не так. Спробуйте ще раз.", rete: "Немає з'єднання. Спробуйте ще раз.",
    },
    nonAttive: "Онлайн-бронювання поки недоступне.", chiamaci: (tel) => (tel ? `Зателефонуйте нам: ${tel}.` : ""),
    anteprima: "Попередній перегляд: онлайн-бронювання не активне.",
    occasioni: ["", "День народження", "Річниця", "Діловий вечір", "Інше"],
    mesi: ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"],
    gg: ["П", "В", "С", "Ч", "П", "С", "Н"],
    annullaTitolo: "Скасувати бронювання", annulla: "Скасувати бронювання", annullata: "Бронювання скасовано. Сподіваємося скоро вас побачити.",
    nonAnnullabile: "Це бронювання вже не можна скасувати онлайн.", nonTrovata: "Бронювання не знайдено.",
    pers: (n) => {
      const d = n % 10, c = n % 100;
      if (d === 1 && c !== 11) return `${n} особа`;
      if (d >= 2 && d <= 4 && (c < 12 || c > 14)) return `${n} особи`;
      return `${n} осіб`;
    },
    alle: "о",
  },
};

// Veste del sito tregobbi.it (carta, inchiostro, ottone; EB Garamond + Courier Prime), con i caratteri
// serviti da TRGB stesso: nessuna richiesta a Google o ad altri prima che il cliente prenoti.
const STILE = `
@import url('/fonts/prenota/prenota-font.css');
.tp { font-family: 'EB Garamond', Georgia, serif; color: #1A1714; background: #FBF8F3; }
.tp-mono { font-family: 'Courier Prime', 'Courier New', monospace; letter-spacing: .08em; text-transform: uppercase; color: #9A6B3C; }
.tp-btn { border: 1px solid #1A1714; padding: .45rem .8rem; background: #FBF8F3; color: #1A1714; font-family: 'Courier Prime', 'Courier New', monospace; font-size: .9rem; min-height: 40px; }
.tp-btn:hover:not(:disabled) { background: #F3EFE7; }
.tp-btn.on { background: #1A1714; color: #FBF8F3; }
.tp-btn.attesa { border-style: dashed; }
.tp-btn.attesa.on { border-style: solid; }
.tp-btn:disabled { border-color: #d8d0c4; color: #c4bbb0; }
.tp-input { width: 100%; border: 0; border-bottom: 1px solid #8a8178; padding: .4rem 0; font-family: 'EB Garamond', Georgia, serif; font-size: 1.15rem; background: transparent; outline: none; color: #1A1714; }
.tp-input:focus { border-color: #1A1714; }
.tp-go { width: 100%; background: #1A1714; color: #FBF8F3; padding: .85rem; font-family: 'Courier Prime', 'Courier New', monospace; letter-spacing: .15em; text-transform: uppercase; }
.tp-go:disabled { opacity: .4; }
.tp-link { color: #9A6B3C; text-decoration: underline; text-underline-offset: 3px; }
.tp-giorno { height: 2.5rem; font-size: 1.125rem; }
.tp-giorno.sel { background: #1A1714; color: #FBF8F3; }
.tp-giorno.libero:hover { background: #F3EFE7; }
.tp-giorno.pieno { color: #8a8178; text-decoration: line-through; }
.tp-giorno.spento { color: #d8d0c4; }
.tp-nota { color: #6b6258; }
`;

// Su prenota.<dominio> si parla col server attraverso lo stesso indirizzo (nginx inoltra
// solo /api/public/prenota): il cliente non vede mai l'indirizzo del gestionale.
const SU_PRENOTA = typeof window !== "undefined" && window.location.hostname.startsWith("prenota.");
const BASE = SU_PRENOTA ? "/api/public/prenota" : `${API_BASE}/public/prenota`;

function chiama(path, opts = {}) {
  // Il token (anteprima admin) esiste solo su app.<dominio>: su prenota.* il localStorage è un altro
  const token = (() => { try { return localStorage.getItem("token"); } catch { return null; } })();
  const headers = { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${BASE}${path}`, { ...opts, headers });
}

/** La lingua: quella passata dal sito (?lang=), altrimenti quella del browser, altrimenti inglese. */
function linguaDa(codice) {
  const c = String(codice || "").slice(0, 2).toLowerCase();
  return LINGUE.includes(c) ? c : null;
}

function linguaIniziale() {
  return linguaDa(new URLSearchParams(window.location.search).get("lang"))
    || linguaDa(navigator.language) || "en";
}

function useAltezzaIframe(ref) {
  useEffect(() => {
    if (window.parent === window || !ref.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      window.parent.postMessage({ type: "trgb-prenota-altezza", altezza: ref.current.scrollHeight + 24 }, "*");
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
}

function SceltaLingua({ lingua, setLingua }) {
  return (
    <div className="tp-mono text-xs flex gap-2 flex-wrap justify-end">
      {LINGUE.map((l) => (
        <button key={l} onClick={() => setLingua(l)} className={lingua === l ? "underline" : "opacity-60"}>{l}</button>
      ))}
    </div>
  );
}

function Calendario({ t, mese, setMese, giorni, scelto, onScegli, minMese, maxMese }) {
  const [anno, m] = mese.split("-").map(Number);
  const primo = new Date(anno, m - 1, 1);
  const offset = (primo.getDay() + 6) % 7;
  const nGiorni = new Date(anno, m, 0).getDate();
  const celle = [...Array(offset).fill(null), ...Array.from({ length: nGiorni }, (_, i) => i + 1)];
  const sposta = (d) => {
    const x = new Date(anno, m - 1 + d, 1);
    setMese(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button className="px-3 text-xl disabled:opacity-20" disabled={mese <= minMese} onClick={() => sposta(-1)}>‹</button>
        <div className="text-xl">{t.mesi[m - 1]} {anno}</div>
        <button className="px-3 text-xl disabled:opacity-20" disabled={mese >= maxMese} onClick={() => sposta(1)}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {t.gg.map((g, i) => <div key={i} className="tp-mono text-[10px]">{g}</div>)}
        {celle.map((g, i) => {
          if (!g) return <div key={i} />;
          const iso = `${mese}-${String(g).padStart(2, "0")}`;
          const st = giorni?.[iso];
          // un giorno pieno si apre lo stesso: si può chiedere la lista d'attesa
          const apribile = st === "libero" || st === "pieno";
          const cls = scelto === iso ? "sel" : st === "libero" ? "libero" : st === "pieno" ? "pieno" : "spento";
          return (
            <button key={i} disabled={!apribile} onClick={() => onScegli(iso)}
              title={st === "chiuso" ? t.chiuso : st === "pieno" ? t.pieno : ""} className={`tp-giorno ${cls}`}>
              {g}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Prenotazione({ notaIniziale = "" }) {
  const [lingua, setLingua] = useState(linguaIniziale);
  const t = T[lingua];
  const radice = useRef(null);
  useAltezzaIframe(radice);
  const [info, setInfo] = useState(null);
  const [pax, setPax] = useState(2);
  const oggi = new Date();
  const meseOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
  const [mese, setMese] = useState(meseOggi);
  const [giorni, setGiorni] = useState(null);
  const [data, setData] = useState(null);
  const [orari, setOrari] = useState(null);
  const [ora, setOra] = useState(null);
  const [attesa, setAttesa] = useState(false);   // il cliente ha scelto la lista d'attesa
  const vuoto = { titolo: "", nome: "", cognome: "", telefono: "", email: "", occasione: "", allergie: "", note: notaIniziale, privacy: false, sito_web: "" };
  const [f, setF] = useState(vuoto);
  const [errore, setErrore] = useState(null);
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(null);
  const aperto = useRef(Date.now());

  useEffect(() => {
    chiama("/info").then((r) => r.json()).then(setInfo).catch(() => setInfo({ attivo: false }));
  }, []);

  // Nessun anticipo massimo (dal 27/11/2026): i mesi si sfogliano liberi, i giorni chiusi li dice il calendario.
  const maxMese = useMemo(() => {
    if (!info?.giorni_max) return "9999-12";
    const x = new Date(Date.now() + info.giorni_max * 86400000);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  }, [info]);

  const gruppoGrande = info && pax > info.max_richiesta;
  const richiesta = info && pax > info.max_automatica && !gruppoGrande;

  useEffect(() => {
    if (!info?.attivo || gruppoGrande) return;
    setGiorni(null);
    chiama(`/calendario?mese=${mese}&pax=${pax}`).then((r) => r.json()).then((d) => setGiorni(d.giorni || {})).catch(() => setGiorni({}));
  }, [info, mese, pax, gruppoGrande]);

  const caricaOrari = useCallback(() => {
    if (!data || gruppoGrande) { setOrari(null); return; }
    setOrari(null);
    chiama(`/orari?data=${data}&pax=${pax}`).then((r) => r.json()).then(setOrari).catch(() => setOrari({ turni: [] }));
  }, [data, pax, gruppoGrande]);
  useEffect(() => { setOra(null); setAttesa(false); caricaOrari(); }, [caricaOrari]);

  // Solo gli orari liberi; gli altri del turno (attesa=true) per la lista d'attesa
  const turni = useMemo(() => (orari?.turni || []).map((tu) => ({
    turno: tu.turno,
    liberi: tu.orari.filter((o) => o.libero),
    attesa: tu.orari.filter((o) => !o.libero && o.attesa),
  })), [orari]);
  const nLiberi = turni.reduce((s, tu) => s + tu.liberi.length, 0);
  const nAttesa = turni.reduce((s, tu) => s + tu.attesa.length, 0);
  const inAttesa = attesa || (orari && nLiberi === 0 && nAttesa > 0);

  const invia = async () => {
    setErrore(null);
    setInvio(true);
    try {
      const r = await chiama("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, titolo: f.titolo || null, data, ora, pax, lingua, lista_attesa: !!inAttesa, aperto_ms: Date.now() - aperto.current }),
      });
      const d = await r.json();
      if (r.ok) { setFatto(d); return; }
      const campo = d?.detail?.campo || "generico";
      setErrore(t.errori[campo] || t.errori.generico);
      if (campo === "occupato") { setOra(null); caricaOrari(); }
    } catch {
      setErrore(t.errori.rete);
    } finally {
      setInvio(false);
    }
  };

  const dataLunga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" });

  if (!info) return <div ref={radice} className="tp p-6 text-center tp-nota">…</div>;

  if (!info.attivo) return (
    <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-2">
      <div className="text-3xl">{info.locale}</div>
      <p className="text-lg">{t.nonAttive}</p>
    </div>
  );

  if (fatto) {
    const [titolo, testo] = fatto.stato === "WAITLIST" ? [t.attesaTitolo, t.attesaTesto]
      : fatto.stato === "REQUESTED" ? [t.richiestaTitolo, t.richiestaTesto] : [t.fattoTitolo, t.fattoTesto];
    return (
      <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-4">
        <div className="tp-mono text-xs">{info.locale}</div>
        <div className="text-3xl">{titolo}</div>
        <p className="text-lg">{testo} {dataLunga(fatto.data)} {t.alle} {fatto.ora}, {t.pers(fatto.pax)}.</p>
        <button className="tp-btn" onClick={() => { setFatto(null); setData(null); setOra(null); setAttesa(false); aperto.current = Date.now(); }}>{t.altra}</button>
      </div>
    );
  }

  const datiOk = f.nome.trim() && f.cognome.trim() && f.telefono.trim() && f.email.trim() && f.privacy;
  const sceltaOra = (o) => { setOra(o); setErrore(null); };

  return (
    <div ref={radice} className="tp max-w-xl mx-auto p-5 space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="tp-mono text-xs">{info.locale}</div>
          <h1 className="text-3xl">{t.titolo}</h1>
        </div>
        <SceltaLingua lingua={lingua} setLingua={setLingua} />
      </div>
      {info.anteprima && <div className="text-sm border border-dashed p-2" style={{ borderColor: "#8a8178" }}>{t.anteprima}</div>}
      {info.nota && <p className="text-lg italic">{info.nota}</p>}

      <section>
        <div className="tp-mono text-xs mb-2">1 · {t.persone}</div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} className={`tp-btn ${pax === n ? "on" : ""}`} onClick={() => setPax(n)}>{n}</button>
          ))}
          <select className={`tp-btn ${pax > 8 ? "on" : ""}`} value={pax > 8 ? pax : ""} onChange={(e) => e.target.value && setPax(+e.target.value)}>
            <option value="">{t.altro}</option>
            {Array.from({ length: Math.max(0, info.max_richiesta - 8) + 1 }, (_, i) => i + 9).map((n) => (
              <option key={n} value={n}>{n > info.max_richiesta ? `${info.max_richiesta}+` : n}</option>
            ))}
          </select>
        </div>
        {richiesta && <p className="mt-2 text-base">{t.richiestaInfo(info.max_automatica + 1)}</p>}
        {gruppoGrande && <p className="mt-2 text-lg">{t.gruppo(info.telefono)}</p>}
      </section>

      {!gruppoGrande && (
        <section>
          <div className="tp-mono text-xs mb-2">2 · {t.giorno}</div>
          <Calendario t={t} mese={mese} setMese={setMese} giorni={giorni} scelto={data} onScegli={setData}
            minMese={meseOggi} maxMese={maxMese} />
        </section>
      )}

      {!gruppoGrande && data && (
        <section>
          <div className="tp-mono text-xs mb-2">3 · {t.orario} <span className="normal-case tracking-normal tp-nota" style={{ fontFamily: "inherit" }}>— {dataLunga(data)}</span></div>
          {!orari ? <div className="tp-nota">…</div> : turni.length === 0 ? (
            <p className="text-lg">{t.nessunOrario} {t.chiamaci(info.telefono)}</p>
          ) : !inAttesa ? (
            <>
              {turni.filter((tu) => tu.liberi.length).map((tu) => (
                <div key={tu.turno} className="mb-3">
                  <div className="text-lg mb-1">{tu.turno === "pranzo" ? t.pranzo : t.cena}</div>
                  <div className="flex flex-wrap gap-2">
                    {tu.liberi.map((o) => (
                      <button key={o.ora} className={`tp-btn ${ora === o.ora ? "on" : ""}`} onClick={() => sceltaOra(o.ora)}>{o.ora}</button>
                    ))}
                  </div>
                </div>
              ))}
              {nAttesa > 0 && (
                <p className="text-lg mt-3 pt-3" style={{ borderTop: "1px solid #d8d0c4" }}>
                  {t.altroOrario}{" "}
                  <button className="tp-link" onClick={() => { setAttesa(true); setOra(null); }}>{t.attesaLink}</button>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-lg mb-2">{nLiberi === 0 ? t.attesaPieno : t.attesaInfo}</p>
              {nLiberi === 0 && <p className="text-base mb-2 tp-nota">{t.attesaInfo}</p>}
              {turni.filter((tu) => tu.attesa.length).map((tu) => (
                <div key={tu.turno} className="mb-3">
                  <div className="text-lg mb-1">{tu.turno === "pranzo" ? t.pranzo : t.cena}</div>
                  <div className="flex flex-wrap gap-2">
                    {tu.attesa.map((o) => (
                      <button key={o.ora} className={`tp-btn attesa ${ora === o.ora ? "on" : ""}`} onClick={() => sceltaOra(o.ora)}>{o.ora}</button>
                    ))}
                  </div>
                </div>
              ))}
              {nLiberi > 0 && <button className="tp-link text-base" onClick={() => { setAttesa(false); setOra(null); }}>{t.torna}</button>}
            </>
          )}
        </section>
      )}

      {!gruppoGrande && data && ora && (
        <section className="space-y-4">
          <div className="tp-mono text-xs">4 · {t.dati}</div>
          <div className="flex gap-2">
            {t.sig.map(([v, l]) => (
              <button key={v} type="button" className={`tp-btn ${f.titolo === v ? "on" : ""}`}
                onClick={() => setF({ ...f, titolo: f.titolo === v ? "" : v })}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input className="tp-input" placeholder={t.nome} autoComplete="given-name" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
            <input className="tp-input" placeholder={t.cognome} autoComplete="family-name" value={f.cognome} onChange={(e) => setF({ ...f, cognome: e.target.value })} />
            <input className="tp-input" placeholder={t.telefono} type="tel" autoComplete="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            <input className="tp-input" placeholder={t.email} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <p className="text-sm tp-nota -mt-2">{t.telefonoAiuto}</p>
          <select className="tp-input" value={f.occasione} onChange={(e) => setF({ ...f, occasione: e.target.value })}>
            {t.occasioni.map((o, i) => <option key={i} value={o}>{o || t.occasione}</option>)}
          </select>
          <input className="tp-input" placeholder={t.allergie} value={f.allergie} onChange={(e) => setF({ ...f, allergie: e.target.value })} />
          <textarea className="tp-input" rows={2} placeholder={t.note} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          {/* esca per i programmi automatici: nascosta alle persone */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.sito_web} onChange={(e) => setF({ ...f, sito_web: e.target.value })}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} name="sito_web" />
          <label className="flex gap-2 items-start text-base">
            <input type="checkbox" className="mt-1.5" checked={f.privacy} onChange={(e) => setF({ ...f, privacy: e.target.checked })} />
            <span>{t.privacy}</span>
          </label>
          <div className="text-lg">{dataLunga(data)} {t.alle} {ora} · {t.pers(pax)}</div>
          {errore && <div className="text-base" style={{ color: "#a3261b" }}>{errore}</div>}
          <button className="tp-go" disabled={!datiOk || invio} onClick={invia}>
            {invio ? t.invio : inAttesa ? t.attesaBtn : richiesta ? t.richiedi : t.prenota}
          </button>
        </section>
      )}
    </div>
  );
}

function Annulla() {
  const { token } = useParams();
  const radice = useRef(null);
  useAltezzaIframe(radice);
  const [d, setD] = useState(null);
  const [stato, setStato] = useState(null); // null | "fatto" | "errore" | "non_trovata"
  const [lingua, setLingua] = useState(linguaIniziale);
  useEffect(() => {
    chiama(`/annulla/${token}`).then(async (r) => {
      if (!r.ok) { setStato("non_trovata"); return; }
      const x = await r.json();
      setD(x);
      const l = linguaDa(x.lingua);
      if (l) setLingua(l);
    }).catch(() => setStato("non_trovata"));
  }, [token]);
  const t = T[lingua];
  const annulla = async () => {
    const r = await chiama(`/annulla/${token}`, { method: "POST" });
    setStato(r.ok ? "fatto" : "errore");
  };
  const dataLunga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div ref={radice} className="tp max-w-md mx-auto p-6 text-center space-y-4">
      <div className="tp-mono text-xs">{d?.locale || ""}</div>
      <div className="text-3xl">{t.annullaTitolo}</div>
      {stato === "non_trovata" && <p className="text-lg">{t.nonTrovata}</p>}
      {d && stato !== "fatto" && (
        <>
          <p className="text-lg">{d.nome ? `${d.nome}, ` : ""}{dataLunga(d.data)} {t.alle} {d.ora} · {t.pers(d.pax)}</p>
          {d.annullabile && stato !== "errore" ? (
            <button className="tp-go" onClick={annulla}>{t.annulla}</button>
          ) : <p className="text-lg">{t.nonAnnullabile}</p>}
        </>
      )}
      {stato === "fatto" && <p className="text-lg">{t.annullata}</p>}
    </div>
  );
}

/**
 * Il widget dentro un'altra pagina pubblica (es. /regalo/<chiave> della gift card).
 * `nota` precompila «Note per noi» (il cliente la vede e la può cambiare).
 * Le regole restano quelle del widget: se `widget_attivo` è 0 mostra «non attive»,
 * quindi chi lo incorpora controlla prima /public/prenota/info (vedi `widgetAttivo`).
 */
export function PrenotaIncorporata({ nota }) {
  return (
    <>
      <style>{STILE}</style>
      <Prenotazione notaIniziale={nota || ""} />
    </>
  );
}

/** true se il widget TRGB accetta prenotazioni (o se un admin loggato è in anteprima). */
export async function widgetAttivo() {
  try {
    const r = await chiama("/info");
    const d = await r.json();
    return !!d.attivo;
  } catch {
    return false;
  }
}

export default function Prenota({ annulla }) {
  return (
    <>
      <style>{STILE}</style>
      <div className="min-h-screen" style={{ background: "#FBF8F3" }}>{annulla ? <Annulla /> : <Prenotazione />}</div>
    </>
  );
}
