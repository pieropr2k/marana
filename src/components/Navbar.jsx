const Icono = {
  buscar: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c4-9 8 4 12-6s4-5 6-4" /><circle cx="19" cy="7" r="1.6" /></svg>
  ),
  coleccion: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
  ),
  nuestras: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6.5" width="17" height="12" rx="2" /><circle cx="12" cy="12.5" r="3.2" /><path d="M8.5 6.5l1-2h5l1 2" /></svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.8v.1" /></svg>
  ),
};

export const PAGINAS = [
  { id: "buscar", etiqueta: "Buscar", icono: Icono.buscar },
  { id: "coleccion", etiqueta: "La colección", corta: "Colección", icono: Icono.coleccion },
  { id: "nuestras", etiqueta: "Fotos nuestras", corta: "Nuestras", icono: Icono.nuestras },
  { id: "info", etiqueta: "Cómo funciona", corta: "Cómo funciona", icono: Icono.info },
];

export default function Navbar({ page }) {
  return (
    <nav className="navbar" aria-label="Principal">
      <a className="nav-marca" href="#/">Maraña</a>
      <ul className="nav-lista">
        {PAGINAS.map((p) => (
          <li key={p.id}>
            <a href={p.id === "buscar" ? "#/" : "#/" + p.id} className="nav-link" aria-current={page === p.id ? "page" : undefined}>
              {p.icono}
              <span className="nav-txt">{p.corta || p.etiqueta}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
