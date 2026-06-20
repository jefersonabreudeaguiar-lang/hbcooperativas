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
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export function gerarPixCopiaCola(options: {
  chave: string;
  valor: number;
  nome: string;
  cidade?: string;
}): string {
  const nome = sanitize(options.nome, 25);
  const cidade = sanitize(options.cidade ?? "BRASIL", 15);
  const mai = emv("00", "BR.GOV.BCB.PIX") + emv("01", options.chave.trim());
  let payload =
    emv("00", "01") +
    emv("01", "12") +
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
