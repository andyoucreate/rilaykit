import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          borderRadius: '22%',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          width="120"
          height="120"
        >
          <circle cx="4" cy="12" r="3" fill="#d4a020" />
          <circle cx="20" cy="6" r="2.5" fill="#d4a020" />
          <circle cx="20" cy="18" r="2.5" fill="#d4a020" />
          <path d="M7 12 C12 12, 14 6, 17.5 6" stroke="#d4a020" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 12 C12 12, 14 18, 17.5 18" stroke="#d4a020" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
