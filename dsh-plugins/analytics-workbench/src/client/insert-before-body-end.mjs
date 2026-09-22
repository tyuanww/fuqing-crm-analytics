export function insertBeforeBodyEnd(html, insertion) {
  // A function replacer keeps `$&` in minified scripts literal. String
  // replacement would turn that sequence into the matched `</body>`.
  return String(html).replace('</body>', () => insertion + '</body>');
}
