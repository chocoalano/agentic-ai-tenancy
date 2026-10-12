import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Badge } from "./Badge.vue"

export const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-office-cyan/45 bg-office-cyan/12 text-office-cyan [a&]:hover:bg-office-cyan/20",
        secondary:
          "border-blue-400/35 bg-[linear-gradient(135deg,#112b54,#0a1938)] text-blue-100 [a&]:hover:border-office-cyan/60",
        destructive:
         "border-destructive/50 bg-destructive/15 text-[oklch(0.85_0.12_25)] [a&]:hover:bg-destructive/25 focus-visible:ring-destructive/40",
        outline:
          "border-blue-400/35 bg-[#0a1938]/60 text-blue-100 [a&]:hover:border-office-cyan/60 [a&]:hover:text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)
export type BadgeVariants = VariantProps<typeof badgeVariants>
