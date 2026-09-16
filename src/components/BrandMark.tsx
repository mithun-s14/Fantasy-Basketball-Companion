import Image from "next/image";

/**
 * The product logo, used wherever the brand row appears (shell sidebar, auth
 * page). Sits on a light tile so the logo's black linework stays legible in
 * dark mode.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid flex-none place-items-center overflow-hidden rounded-[7px] bg-white"
      style={{ width: size, height: size }}
    >
      <Image
        src="/fbclogo.png"
        alt="Fantasy Basketball Companion"
        width={size}
        height={size}
        priority
        className="object-contain"
      />
    </span>
  );
}
