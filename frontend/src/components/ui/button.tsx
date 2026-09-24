import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { ButtonHTMLAttributes } from "react"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] px-4 py-2 text-[var(--paper)] hover:bg-[var(--ink-soft)]",
        outline:
          "border border-[var(--line-strong)] bg-transparent px-4 py-2 text-[var(--ink)] hover:bg-[var(--surface-raised)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button"
  return <Component className={cn(buttonVariants({ variant, className }))} {...props} />
}
