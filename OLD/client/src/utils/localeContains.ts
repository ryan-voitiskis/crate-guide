// modified from https://stackoverflow.com/a/69623589/7259172
export default (x: string, y: string) => {
  if (!y || !x.length) return false
  y = "" + y
  if (y.length > x.length) return false
  const ascii = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  return ascii(x).includes(ascii(y))
}
