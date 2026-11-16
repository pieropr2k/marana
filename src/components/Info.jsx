import { FUENTES } from "../lib/util.js";

export function Cabecera() {
  return (
    <header className="cabecera">
      <div className="wrap">
        <p className="ceja">Cableado aéreo · Perú</p>
        <h1 className="marca">Maraña</h1>
        <p className="bajada">Dibuja una forma. El programa la busca entre los cables enredados de las calles del Perú y te muestra la foto donde aparece, con el lugar donde fue tomada.</p>
      </div>
      <svg className="cables-cabecera" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-20 62 Q 500 190 1020 40" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        <path d="M-20 92 Q 420 210 1020 70" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <path d="M-20 30 Q 600 150 1020 118" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d="M-20 140 Q 300 230 1020 96" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </header>
  );
}

const PASOS = [
  ["Encuentra los cables", "En cada foto busca líneas delgadas y oscuras contra el cielo con un filtro de imagen llamado black-hat. En las fotos de la colección, el cielo lo marcó antes un modelo entrenado para reconocer cielo, así no confunde vidrios, fachadas claras, antenas ni árboles con cables."],
  ["Lee su dirección", "Anota hacia dónde va cada tramo de cable: horizontal, diagonal o vertical, en 12 direcciones."],
  ["Prueba tu dibujo miles de veces", "Lo coloca en distintas posiciones, tamaños y giros, y mide qué tan cerca pasan cables con la misma dirección que tu trazo. Si dibujaste varios trazos, prueba también el más largo y el contorno, y te dice qué parte encontró."],
  ["Solo muestra lo que pasa la prueba", "Exige que casi todo tu trazo pase por cables y que la forma destaque de su entorno. Si nada lo logra, lo dice y muestra las más cercanas como aproximadas."],
];

export function Como() {
  return (
    <section className="como" aria-labelledby="como-cab">
      <h2 className="seccion-cab" id="como-cab">¿Cómo funciona?</h2>
      <ol className="pasos">
        {PASOS.map(([titulo, texto], i) => (
          <li key={i}><span className="n">{i + 1}</span><h3>{titulo}</h3><p>{texto}</p></li>
        ))}
      </ol>
      <p className="honesto">El programa no dibuja ni inventa nada: los cables que se iluminan ya estaban en la foto.</p>
    </section>
  );
}

export function Fuentes({ real }) {
  const porFuente = { commons: 0, mapillary: 0, grupo: 0 };
  for (const it of real) porFuente[it.kind === "coleccion" ? it.fuente : "grupo"]++;
  const usadas = [];
  if (porFuente.commons) usadas.push("Wikimedia Commons (cada foto con su autor y su licencia, casi siempre Creative Commons)");
  if (porFuente.mapillary) usadas.push("Mapillary (CC BY-SA 4.0; difumina caras y placas automáticamente)");
  if (porFuente.grupo) usadas.push("fotos tomadas por el grupo y por el equipo");
  const recortadas = real.filter((it) => it.recorte).length;
  const conModelo = real.some((it) => it.enc && it.enc.cm);
  const derivadas = " La imagen con cables iluminados y la postal descargable llevan dentro el crédito (autor, licencia y enlace) y avisan que están modificadas. Con fotos CC BY-SA, esas versiones se comparten con la misma licencia.";
  const texto = usadas.length
    ? `Fotos de ${usadas.join("; ")}. La cartela de cada resultado indica autor, licencia y enlace a la fuente. Las imágenes con cables iluminados son obras derivadas y se comparten con la misma licencia que la foto original.` +
      (recortadas ? ` ${recortadas} ${recortadas === 1 ? "foto está recortada" : "fotos están recortadas"}: se quitó la parte de abajo para no mostrar personas ni placas.` : "") +
      (conModelo ? " El cielo de las fotos de la colección se marcó con un modelo de segmentación de cielo publicado por OpenDroneMap (SkyRemoval)." : "") +
      derivadas + " Calles y distritos: © colaboradores de OpenStreetMap; esos datos se comparten con su licencia, ODbL."
    : "Por ahora solo hay imágenes de prueba generadas por computadora.";
  return (
    <section className="como fuentes" aria-labelledby="fuentes-cab">
      <h2 className="seccion-cab" id="fuentes-cab">Fuentes y licencias</h2>
      <p>{texto}</p>
    </section>
  );
}

export { FUENTES };
