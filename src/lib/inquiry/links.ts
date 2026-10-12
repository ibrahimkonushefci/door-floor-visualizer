import type { BrandConfig } from '../data/types';
import type { ContactAction, ContactChannel } from './types';
export function resolveContactAction(
  channel: ContactChannel,
  brand: BrandConfig,
  message: string,
  canonicalUrl: string,
): ContactAction {
  // Demo branch precedes any construction of an actionable external URL.
  if (brand.demoMode)
    return { kind: 'preview', title: brand.companyName, message, copyText: message };
  const contact = brand.contact[channel];
  if (!contact) return { kind: 'preview', title: brand.companyName, message, copyText: message };
  if (!/^\+[0-9]{8,15}$/.test(contact) || contact === '+38344000000')
    throw new Error('Invalid live contact');
  if (channel === 'phone')
    return { kind: 'external', href: `tel:${contact}`, fullMessage: message, copyRequired: false };
  if (channel === 'whatsapp')
    return {
      kind: 'external',
      href: `https://wa.me/${contact.slice(1)}?text=${encodeURIComponent(message)}`,
      fullMessage: message,
      copyRequired: false,
    };
  const compact = `${brand.companyName}\n${canonicalUrl}`;
  const text = message.length <= 200 ? message : compact;
  if (text.length > 200)
    return { kind: 'preview', title: brand.companyName, message, copyText: message };
  return {
    kind: 'external',
    href: `viber://forward?text=${encodeURIComponent(text)}`,
    fullMessage: message,
    copyRequired: true,
  };
}

// Dependency injection makes denied/unavailable clipboard behavior testable.
export async function copyInquiryText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | null | undefined,
): Promise<boolean> {
  try {
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
