

const GraphIcon = ({ width = 24, height = 24, color = "currentColor", ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* The 'd' attribute below defines the path for a simple line graph icon */}
      <path d="M3 3v18h18" />
      <path d="M18 10l-6 6-4-4-3 3" />
    </svg>
  );
};

export default GraphIcon;
