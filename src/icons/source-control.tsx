export default function GitHubSourceControl({
  className,
}: {
  className: string;
}) {
  return (
    <svg
      height="32"
      viewBox="0 0 16 16"
      version="1.1"
      width="32"
      xmlns="http://www.w3.org"
      className={className}
    >
      <path
        fill="currentColor"
        d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.378a2.251 2.251 0 11-1.5 0V4.622a2.251 2.251 0 111.5 0v3.128A2.5 2.5 0 017.5 6h2.5A1 1 0 0011 5V4.622a2.25 2.25 0 01-.75-1.372zM3.5 4a.75.75 0 100-1.5.75.75 0 000 1.5zM5 12.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
      ></path>
    </svg>
  );
}
