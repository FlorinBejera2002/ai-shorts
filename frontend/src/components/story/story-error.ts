/** Keep engine details in the authenticated project response and worker logs. */
export function storyFailureReason(project: {
  status: string
  operation_status?: string
  error?: string
  message?: string
}) {
  return project.error ||
    (project.status === 'failed' || project.operation_status === 'failed'
      ? project.message
      : undefined)
}

export function storyProblem(
  message: string,
  text: (en: string, ro: string, es?: string) => string
) {
  if (/AI provider.*(?:credit|balance|payment|spending limit)/i.test(message))
    return text(
      'The editing service has reached its usage limit. Your files and previous video are saved. Try again later or contact support.',
      'Serviciul de editare și-a atins limita de utilizare. Fișierele și videoul anterior sunt salvate. Reîncearcă mai târziu sau contactează asistența.'
    )
  if (/story planning could not finish/i.test(message))
    return text(
      'The edit could not be planned. Your clips, music and previous video are saved. Retry to finish planning before rendering.',
      'Planificarea montajului nu s-a finalizat. Filmările, muzica și videoul anterior sunt salvate. Reîncearcă pentru a finaliza planul înainte de randare.'
    )
  if (/source analysis could not establish visual content/i.test(message))
    return text(
      'The clip analysis could not identify enough visual content for musical editing. Your files are saved. Retry analysis before generating the video.',
      'Analiza filmărilor nu a identificat suficient conținut vizual pentru montajul pe muzică. Fișierele sunt salvate. Reîncearcă analiza înainte de a genera videoul.'
    )
  if (/music.only.*(?:speech|dialogue)|mute.*(?:speech|dialogue).*conflict|source audio.*conflict/i.test(message))
    return text(
      'Music only conflicts with keeping dialogue. Choose Keep original sound, or update your description to allow muted dialogue.',
      'Opțiunea Doar muzică nu permite păstrarea dialogului. Alege Păstrează sunetul original sau modifică descrierea pentru a permite oprirea dialogului.'
    )
  if (/music analysis|music.*analy[sz]|soundtrack.*analy[sz]/i.test(message))
    return text(
      'Music analysis could not finish. Retry, or turn off Follow the music to continue with the same soundtrack and existing cut timing.',
      'Analiza muzicii nu s-a finalizat. Reîncearcă sau dezactivează Urmărește muzica pentru a continua cu aceeași piesă și momentele existente ale tăieturilor.'
    )
  if (/caption choice conflicts/i.test(message))
    return text(
      'Your caption choice conflicts with the description. Update the description or choose matching captions.',
      'Opțiunea de subtitrare nu corespunde descrierii. Actualizează descrierea sau alege subtitrările potrivite.'
    )
  if (/no shorter equivalent|no removable|no safe.*pace/i.test(message))
    return text(
      'No shorter edit is available without changing the spoken content. Your video is unchanged.',
      'Nu există un montaj mai scurt care să păstreze conținutul vorbit. Videoul rămâne neschimbat.'
    )
  if (/unlock|locked/i.test(message))
    return text(
      'Open the video in Studio to review its locked clips.',
      'Deschide videoul în Studio pentru a verifica filmările blocate.'
    )
  if (/noise reduction is unavailable/i.test(message))
    return text(
      'Background noise reduction is unavailable. Turn it off to continue with the original sound.',
      'Reducerea zgomotului de fundal nu este disponibilă. Dezactiveaz-o pentru a continua cu sunetul original.'
    )
  if (/cleanup|deepfilter|denois/i.test(message))
    return text(
      'Audio cleanup could not finish. Retry, or turn it off to continue with the original sound.',
      'Curățarea sunetului nu s-a finalizat. Reîncearcă sau dezactiveaz-o pentru a continua cu sunetul original.'
    )
  if (/font/i.test(message))
    return text(
      'The selected font is unavailable. Choose an available font and try again.',
      'Fontul selectat nu este disponibil. Alege un font disponibil și reîncearcă.'
    )
  if (/logo|watermark/i.test(message))
    return text(
      'The selected logo is unavailable. Replace it in your Brand Kit and try again.',
      'Sigla selectată nu este disponibilă. Înlocuiește-o în Brand Kit și reîncearcă.'
    )
  if (/music|soundtrack/i.test(message))
    return text(
      'The selected music is unavailable. Retry or choose another track.',
      'Muzica selectată nu este disponibilă. Reîncearcă sau alege altă piesă.'
    )
  if (/credit/i.test(message))
    return text(
      'You do not have enough credits to generate this video.',
      'Nu ai suficiente credite pentru a genera acest video.'
    )
  if (/format|empty file|file size|total size|duration limit/i.test(message))
    return text(
      'A file exceeds the supported format, size or duration limits. Check the limits beside Add clips.',
      'Un fișier nu respectă limitele de format, dimensiune sau durată. Verifică limitele de lângă Adaugă filmări.'
    )
  if (/required|missing|unavailable.*source|source.*unavailable/i.test(message))
    return text(
      'A required source is missing or unavailable. Check your uploaded clips and try again.',
      'O sursă necesară lipsește sau nu este disponibilă. Verifică filmările încărcate și reîncearcă.'
    )
  return text(
    'The action could not finish. Your saved files and previous video are safe. Please retry.',
    'Acțiunea nu s-a finalizat. Fișierele salvate și videoul anterior sunt păstrate. Reîncearcă.'
  )
}
