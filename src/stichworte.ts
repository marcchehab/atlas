// Stichworte pro Teilgebiet, nur fürs AI-Label (nicht in der UI): Der RLP ist für manche Fächer so knapp,
// dass typische Themen keinen eindeutigen Platz haben. Quelle Chemie: DCK-Stoffprogramm Grundlagenfach
// Chemie, provisorische Fassung 2024 (https://www.vsn.ch/stoffprogramm.html). Schlüssel «<fach>:<teilgebiet>».
// Das Raster gehört nicht zur Bewertungsversion — Änderungen hier lösen keine Neubewertung aus.
export const STICHWORTE: Record<string, string> = {
  'chemie-gf:1.1': 'Experimente auswerten, Versuchsprotokoll, Hypothese prüfen',
  'chemie-gf:1.2': 'Versuchsanleitungen, Praktika, Laborsicherheit, Gefahrensymbole/GHS, H- und P-Sätze, LD50, MAK-Wert, Toxikologie',
  'chemie-gf:2.1': 'Dichte, Löslichkeit, Schmelz-/Siedetemperatur, Aggregatzustände, Reinstoff/Gemisch, Element/Verbindung, Lösen und Kristallisieren, Fällungsreaktionen und Ionennachweise, Komplexe/Aquakomplexe',
  'chemie-gf:2.2': 'Filtration, Zentrifugation, Destillation, Extraktion, Chromatographie',
  'chemie-gf:3.1': 'Modellcharakter, historische Entwicklung Demokrit bis Dalton',
  'chemie-gf:3.2': 'Rutherford, Kern-Hülle-Modell, Schalenmodell, Elektronenkonfiguration, Kugelwolken-/Orbitalmodell, Hybridisierung, Quantenchemie, Isotope, Nukleonenzahl, Atommasse, Coulomb-Gesetz',
  'chemie-gf:3.3': 'Haupt-/Nebengruppen, Periodizität, Valenzelektronen, Lewis-Schreibweise der Atome, Edelgasregel',
  'chemie-gf:4.1': 'Elektronenpaarbindung, Lewis-Formeln, Molekülgeometrie/VSEPR, Elektronegativität, Polarität/Dipol, Ionenbindung, Salze, Ionenladung, Gitterenergie, mehratomige Ionen, Metallbindung, Legierungen, anorganische Nomenklatur und Formeln',
  'chemie-gf:4.2': 'Van-der-Waals/London-Kräfte, Dipol-Dipol, Wasserstoffbrücken, Ion-Dipol, Siedetemperaturen, Mischbarkeit, hydrophil/hydrophob',
  'chemie-gf:5.1': 'Stoffmenge Mol, molare Masse, molares Volumen, Konzentration, Ausbeute; Stoffkreisläufe und Umweltchemie (Treibhauseffekt/CO₂, Luftschadstoffe, Ozon, Erdöl/Raffinerie, Rohstoffe, Recycling, Green Chemistry)',
  'chemie-gf:5.2': 'exotherm/endotherm, Reaktionsenthalpie, Satz von Hess, Entropie, Gibbs-Helmholtz, Spontaneität, Energieträger',
  'chemie-gf:5.3': 'Aktivierungsenergie, Katalysator, Temperatur, Konzentration, Zerteilungsgrad, Autokatalysator',
  'chemie-gf:5.4': 'dynamisches Gleichgewicht, offene/geschlossene Systeme, Massenwirkungsgesetz, Gleichgewichtskonstante, Le Chatelier, Ammoniaksynthese (Haber-Bosch), Löslichkeitsprodukt',
  'chemie-gf:5.5': 'Brønsted, Protolyse, Autoprotolyse, pH-Wert, starke/schwache Säuren, pKs, Indikatoren, Neutralisation, Titration, Puffer, saurer Regen, Wasserhärte',
  'chemie-gf:5.6': 'Oxidationszahlen, Redoxreihe, galvanisches Element, Batterien, Akkus, Brennstoffzelle, Elektrolyse, Korrosion, Hochofen/Stahl, Aluminiumherstellung',
  'chemie-gf:6.1': 'Kohlenwasserstoffe, funktionelle Gruppen, Stoffklassen (Alkane bis Ester, Amine), IUPAC-Nomenklatur organisch, Isomerie (Konstitution, E/Z, R/S, Chiralität), Reaktionstypen Substitution/Addition/Eliminierung, Reaktionsmechanismen',
  'chemie-gf:6.2': 'Kunststoffe/Polymere, Polymerisation, Polykondensation, Mikroplastik, Fette, Seifen, Tenside, Kohlenhydrate, Aminosäuren, Proteine, Enzyme, Medikamente, Farbstoffe, Erdöl als Rohstoff, Biochemie',
}
