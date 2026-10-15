/** Keep engine details in the authenticated project response and worker logs. */
export function storyProblem(
  message: string,
  text: (en: string, ro: string) => string
) {
  if (/200 clips|clip count|too many (?:files|clips)/i.test(message))
    return text(
      'A project can contain up to 200 clips. Remove some selected files or start another project.',
      'Un proiect poate conține până la 200 de filmări. Elimină unele fișiere selectate sau începe alt proiect.'
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
