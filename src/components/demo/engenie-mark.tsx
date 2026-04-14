export function EngenieMark({ size = 48 }: { size?: number }) {
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size * 1.6, height: size * 1.6 }}
    >
      <div className="absolute inset-0 rounded-full bg-engenius-blue/[0.06] animate-[enginePulse_3.5s_ease-in-out_infinite]" />
      <div className="absolute inset-[12%] rounded-full bg-engenius-blue/[0.04]" />
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
        <path
          d="M28 6 L31.4 22.4 L47 25.8 L31.4 29.2 L28 45.6 L24.6 29.2 L9 25.8 L24.6 22.4 Z"
          fill="#03a9f4"
          opacity="0.9"
        />
        <circle cx="28" cy="25.8" r="2.8" fill="white" opacity="0.95" />
        <path
          d="M42 10 L43 13.2 L46 14 L43 14.8 L42 18 L41 14.8 L38 14 L41 13.2 Z"
          fill="#03a9f4"
          opacity="0.4"
        />
        <path
          d="M12 38 L12.8 40.2 L15 40.8 L12.8 41.4 L12 43.6 L11.2 41.4 L9 40.8 L11.2 40.2 Z"
          fill="#03a9f4"
          opacity="0.3"
        />
      </svg>
      <style>{`
        @keyframes enginePulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}
