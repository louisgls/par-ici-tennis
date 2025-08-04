/**
 * Tennis reservation form defaults configuration.
 * Edit this file to easily change default values in the reservation form.
 * All fields are optional and can be customized.
 */

// Function to calculate date for today + 6 days in YYYY-MM-DD format
function getFutureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

window.FORM_DEFAULTS = {
    // Dynamically set date to today + 6 days
    date: getFutureDate(6),
    hour: "09",        // Default reservation hour
    location: "Alain Mimoun", // Default location (court)
    priceType: ["Tarif plein"], // Default price type (can be several)
    courtType: ["Découvert"],  // Default court type (can be several)
    planTime: "00:00",    // Default planning time
    players: [
        { firstName: "Louis", lastName: "Gallais" }
    ],
    // List of all available tennis court locations
    locations: [
        "Alain Mimoun", "Amandiers", "Atlantique", "Aurelle de Paladines", "Bertrand Dauvin",
        "Bobigny", "Broquedis - Asnières", "Candie", "Carnot", "Château des Rentiers",
        "Cordelières", "Courcelles", "Croix Nivert", "Docteurs Déjerine", "Dunois",
        "Edouard Pailleron", "Elisabeth", "Georges Carpentier", "Halle Fret",
        "Henry de Montherlant", "Jandelle", "Jesse Owens", "Jules Ladoumègue",
        "La Faluère", "Léo Lagrange", "Max Rousié", "Moureu - Baudricourt",
        "NEUVE SAINT PIERRE", "Niox", "Paul Barruel", "Philippe Auguste", "Poissonniers",
        "Poliveau", "Poterne des Peupliers", "Puteaux", "René et André Mourlon",
        "Rigoulot - La Plaine", "Sablonnière", "Sept arpents", "Suzanne Lenglen",
        "Thiéré", "Valeyre"
    ]
};
