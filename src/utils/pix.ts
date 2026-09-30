function emv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function sanitize(str: string, max: number): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .substring(0, max)
    .toUpperCase();
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const EVP_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Formato exigido no QR (campo 26-01) — diferente do que aparece na tela do banco.
 * CPF/CNPJ: só dígitos. Celular: +55DDD9XXXXXXXX. E-mail: minúsculas.
 */
export function normalizarChavePixBrCode(raw: string): string {
  const chave = raw.trim();
  if (!chave) return chave;

  if (chave.includes("@")) return chave.toLowerCase();
  if (EVP_REGEX.test(chave)) return chave.toLowerCase();

  if (chave.startsWith("+")) {
    const digits = chave.replace(/\D/g, "");
    return digits ? `+${digits}` : chave;
  }

  const digits = chave.replace(/\D/g, "");
  if (digits.length === 14) return digits;

  if (digits.length === 11) {
    const ddd = Number.parseInt(digits.slice(0, 2), 10);
    const pareceCelular =
      ddd >= 11 && ddd <= 99 && digits[2] === "9" && !/[.\/-]/.test(chave);
    if (pareceCelular) return `+55${digits}`;
    return digits;
  }

  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;

  return chave;
}

export function gerarPixCopiaCola(options: {
  chave: string;
  valor: number;
  nome: string;
  cidade?: string;
}): string {
  const nome = sanitize(options.nome, 25);
  const cidade = sanitize(options.cidade ?? "BRASIL", 15);
  const chavePix = normalizarChavePixBrCode(options.chave);
  const mai = emv("00", "br.gov.bcb.pix") + emv("01", chavePix);
  let payload =
    emv("00", "01") +
    emv("01", "11") +
    emv("26", mai) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", options.valor.toFixed(2)) +
    emv("58", "BR") +
    emv("59", nome) +
    emv("60", cidade) +
    emv("62", emv("05", "***"));
  payload += "6304";
  return payload + crc16(payload);
}

export function cooperadoPrecisaCadastrarPix(chavePix?: string, pixValido?: boolean): boolean {
  return !chavePix?.trim() || pixValido === false;
}
