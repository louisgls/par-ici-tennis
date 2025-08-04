/**
 * Tennis reservation form defaults configuration.
 * Edit this file to easily change default values in the reservation form.
 * All fields are optional and can be customized.
 */
window.FORM_DEFAULTS = {
    // yyyy-mm-dd or empty (default to today if empty)
    date: "2025-08-10",
    hour: "09",        // Default reservation hour
    location: "Alain Mimoun",         // Default location (court)
    priceType: ["Tarif plein"], // Default price type (can be several)
    courtType: ["Découvert"],  // Default court type (can be several)
    planTime: "00:00",    // Default planning time
    players: [
        { firstName: "Louis", lastName: "Gallais" }
    ]
};
