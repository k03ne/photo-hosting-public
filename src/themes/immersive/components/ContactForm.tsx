import type { BlockComponentProps } from "../../types";
import type { BlockOf } from "../../schema";
import { ContactFormView } from "@/components/portfolio/ContactFormView";

/** Kontaktformular im „immersive"-Theme — gemeinsame Runtime, erbt die Tokens. */
export function ContactForm({ block }: BlockComponentProps<BlockOf<"contactForm">>) {
  const { heading, fields, email } = block.data;
  return <ContactFormView heading={heading} fields={fields} recipient={email} />;
}
