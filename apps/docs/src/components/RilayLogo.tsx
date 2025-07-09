import type { SVGProps } from 'react';

export function RilayLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 40" width="150" height="40" {...props}>
      <title>Rilaykit Logo</title>
      <style>
        {'@import url("https://fonts.googleapis.com/css2?family=Poppins:wght@600&display=swap");'}
      </style>
      <text
        x="5"
        y="30"
        fontFamily="Poppins, sans-serif"
        fontSize="30"
        fontWeight="600"
        fill="currentColor"
      >
        rilaykit ✨
      </text>
    </svg>
  );
}
