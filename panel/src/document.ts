/** Konşimento belgesi + içerik hash'i (JCS-lite). Belge hiçbir zaman zincire yazılmıyor —
 * sadece hash'i (Draft.content_hash → BillOfLadingState.pre_issuance_hash). Bu, gerçek
 * dünyadaki eB/L sistemlerinin (TradeTrust/OpenAttestation, CargoX, WaveBL) evrensel
 * deseni: belge taraflar arasında zincir dışında dolaşır, zincir sadece "bu içerik
 * değişmedi mi" diye doğrular. docs/plan-belge-hash.md'deki tasarım kararlarının aynısı. */

export interface BlDocument {
  document_id: string;
  date_of_issue: string;
  place_of_issue: string;
  shipper: string;
  consignee: string;
  notify_party: string;
  vessel: string;
  voyage_no: string;
  port_of_loading: string;
  port_of_discharge: string;
  marks_and_numbers: string;
  number_of_packages: string;
  description_of_goods: string;
  gross_weight: string;
  measurement: string;
  freight_terms: string;
  number_of_originals: string;
}

// Sıra, nesne tanımı sırası — kanonik hash için önemsiz (zaten sort ediyoruz),
// ama form/parse/doğrulama kodunun hepsi bu tek listeye bakıyor.
export const DOCUMENT_FIELDS: (keyof BlDocument)[] = [
  'document_id',
  'date_of_issue',
  'place_of_issue',
  'shipper',
  'consignee',
  'notify_party',
  'vessel',
  'voyage_no',
  'port_of_loading',
  'port_of_discharge',
  'marks_and_numbers',
  'number_of_packages',
  'description_of_goods',
  'gross_weight',
  'measurement',
  'freight_terms',
  'number_of_originals',
];

export function newDocumentId(): string {
  return crypto.randomUUID();
}

export function emptyDocument(): BlDocument {
  return {
    document_id: newDocumentId(),
    date_of_issue: new Date().toISOString().slice(0, 10),
    place_of_issue: '',
    shipper: '',
    consignee: '',
    notify_party: '',
    vessel: '',
    voyage_no: '',
    port_of_loading: '',
    port_of_discharge: '',
    marks_and_numbers: '',
    number_of_packages: '',
    description_of_goods: '',
    gross_weight: '',
    measurement: '',
    freight_terms: '',
    number_of_originals: '',
  };
}

// JCS (RFC 8785) tam uygulaması yerine kasıtlı sadeleştirilmiş hali: belgedeki TÜM
// alanlar string olduğu için JCS'in en ince kuralı (ECMAScript sayı serileştirmesi)
// hiç devreye girmiyor. Geriye kalan tek şey anahtar sırası — onu da özyinelemeli
// sıralayıp boşluksuz JSON.stringify ile sabitliyoruz. docs/plan-belge-hash.md'de
// bilinçli olarak tercih edilen yaklaşım (dış pakete bağımlılık riski almamak için).
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJson(doc: BlDocument): string {
  return JSON.stringify(sortKeysDeep(doc));
}

export async function canonicalHash(doc: BlDocument): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(canonicalJson(doc));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

export function hashesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function isZeroHash(h: Uint8Array): boolean {
  return h.every((b) => b === 0);
}

/** Yapıştırılan/yüklenen metni BlDocument'e çevirir — beklenen alanların hepsi var mı
 * ve hepsi string mi diye doğrular. Fazladan alan varsa yok sayılır (ileri uyumluluk). */
export function parseDocument(text: string): BlDocument | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  for (const field of DOCUMENT_FIELDS) {
    if (typeof obj[field] !== 'string') return null;
  }
  const doc = {} as BlDocument;
  for (const field of DOCUMENT_FIELDS) {
    doc[field] = obj[field] as string;
  }
  return doc;
}
