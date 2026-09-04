export const BRAND = {
  name: "Southern Magnolia Movers",
  short: "Southern Magnolia",
  software: "MoveOps",
  phone: "(504) 559-6340",
  phoneHref: "tel:+15045596340",
  email: "smagnoliamoving@gmail.com",
  emailHref: "mailto:smagnoliamoving@gmail.com",
  taglinePrimary: "Moving You Forward. Cleaning Out the Past.",
  taglineSecondary: "Big or Small, We Haul It All.",
  welcome: "Moving You Forward.",
  addressLocality: "New Orleans",
  addressRegion: "LA",
  addressCountry: "US",
  serviceAreaLabel: "Serving Greater New Orleans & Southeast Louisiana",
  hoursText: "Mon – Sat: 8:00 AM – 6:00 PM",
  // Paste your Google review deep-link here (search.google.com/local/writereview
  // ?placeid=...). Empty = a Google Maps search for the business is used instead.
  googleReviewUrl: "",
  hours: [
    {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "18:00",
    },
  ],
  // Paste real profile URLs here to emit sameAs trust signals + footer links.
  socials: {
    facebook: "",
    instagram: "",
    yelp: "",
    bbb: "",
    googleMaps: "",
  },
} as const;
