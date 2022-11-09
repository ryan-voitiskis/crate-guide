interface PositionColour {
  letter: string
  colour: string
}

const positionColours: PositionColour[] = [
  { letter: "A", colour: "hsl(342, 60%, 60%)" },
  { letter: "B", colour: "hsl(210, 60%, 55%)" },
  { letter: "C", colour: "hsl(157, 40%, 55%)" },
  { letter: "D", colour: "hsl(30, 71%, 65%)" },
  { letter: "E", colour: "hsl(89, 60%, 50%)" },
  { letter: "F", colour: "hsl(259, 60%, 66%)" },
  { letter: "G", colour: "hsl(55, 44%, 50%)" },
  { letter: "H", colour: "hsl(108, 44%, 50%)" },
  { letter: "I", colour: "hsl(342, 60%, 60%)" },
  { letter: "J", colour: "hsl(210, 60%, 55%)" },
  { letter: "K", colour: "hsl(157, 40%, 55%)" },
  { letter: "L", colour: "hsl(30, 71%, 65%)" },
  { letter: "M", colour: "hsl(89, 60%, 50%)" },
  { letter: "N", colour: "hsl(259, 60%, 66%)" },
  { letter: "O", colour: "hsl(55, 44%, 50%)" },
  { letter: "P", colour: "hsl(108, 44%, 50%)" },
  { letter: "Q", colour: "hsl(342, 60%, 60%)" },
  { letter: "R", colour: "hsl(210, 60%, 55%)" },
  { letter: "S", colour: "hsl(157, 40%, 55%)" },
  { letter: "T", colour: "hsl(30, 71%, 65%)" },
  { letter: "U", colour: "hsl(89, 60%, 50%)" },
  { letter: "V", colour: "hsl(259, 60%, 66%)" },
  { letter: "W", colour: "hsl(55, 44%, 50%)" },
  { letter: "X", colour: "hsl(108, 44%, 50%)" },
  { letter: "Y", colour: "hsl(342, 60%, 60%)" },
  { letter: "Z", colour: "hsl(210, 60%, 55%)" },
]

export default (position: string): string =>
  positionColours.find((i) => i.letter === position.charAt(0))!.colour
