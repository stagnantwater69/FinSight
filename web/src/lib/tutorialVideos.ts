/**
 * The web app's video tutorials (docs/FINSIGHT-WEB-FEATURE-TUTORIAL-SCRIPTS.md),
 * hosted as unlisted YouTube videos. A chapter with no `youtubeId` yet shows as
 * "coming soon": add its ID here once the video is uploaded.
 */
export interface TutorialVideo {
  code: string;
  title: string;
  youtubeId?: string;
  thumbnailSrc?: string;
}

export interface TutorialVideoGroup {
  title: string;
  videos: TutorialVideo[];
}

export const WEB_TUTORIAL_VIDEOS: TutorialVideoGroup[] = [
  {
    title: "Getting started",
    videos: [
      { code: "W01", title: "Register and confirm email", youtubeId: "xjJDLnzW4DU", thumbnailSrc: "/tutorial-thumbnails/W01.webp" },
      { code: "W02", title: "Sign in, Google sign-in and password recovery", youtubeId: "hdj3akcA120", thumbnailSrc: "/tutorial-thumbnails/W02.webp" },
      { code: "W03", title: "First business setup", youtubeId: "U9i3lfrvwSA", thumbnailSrc: "/tutorial-thumbnails/W03.webp" },
      { code: "W04", title: "Navigation, global search and guided tour", youtubeId: "m8_n15MfPUs", thumbnailSrc: "/tutorial-thumbnails/W04.webp" },
      { code: "W05", title: "Create, edit and switch businesses", youtubeId: "3cZvIsmgqxs", thumbnailSrc: "/tutorial-thumbnails/W05.webp" },
      { code: "W06", title: "Archive and restore a business", youtubeId: "BDOzaZ-9EnI", thumbnailSrc: "/tutorial-thumbnails/W06.webp" },
      { code: "W07", title: "Opening balance and record coverage", youtubeId: "r1LWmDqfBr8", thumbnailSrc: "/tutorial-thumbnails/W07.webp" },
      { code: "W08", title: "Operating schedule and special dates", youtubeId: "ds38PY_iYgw", thumbnailSrc: "/tutorial-thumbnails/W08.webp" },
    ],
  },
  {
    title: "Dashboard and records",
    videos: [
      { code: "W09", title: "Dashboard and financial charts", youtubeId: "f34ZGIFHaLw", thumbnailSrc: "/tutorial-thumbnails/W09.webp" },
      { code: "W10", title: "Create categories and classify costs", youtubeId: "n-B-i7j8pcw", thumbnailSrc: "/tutorial-thumbnails/W10.webp" },
      { code: "W11", title: "Add an expense and use category suggestions", youtubeId: "gtFNVG3d7Xs", thumbnailSrc: "/tutorial-thumbnails/W11.webp" },
      { code: "W12", title: "Add sales", youtubeId: "zMeQwFCTV0o", thumbnailSrc: "/tutorial-thumbnails/W12.webp" },
      { code: "W13", title: "Search, filter, sort and inspect records", youtubeId: "eouigf-uQRA", thumbnailSrc: "/tutorial-thumbnails/W13.webp" },
      { code: "W14", title: "Edit, review and delete a record", youtubeId: "NXIGC1Kka6Y", thumbnailSrc: "/tutorial-thumbnails/W14.webp" },
      { code: "W15", title: "Resolve duplicates and large expenses", youtubeId: "XJlVKgqiEfA", thumbnailSrc: "/tutorial-thumbnails/W15.webp" },
    ],
  },
  {
    title: "Receipts and spreadsheets",
    videos: [
      { code: "W16", title: "Upload receipts, pages and separate receipts", youtubeId: "ovk3A81IpvE", thumbnailSrc: "/tutorial-thumbnails/W16.webp" },
      { code: "W17", title: "Receipt fields, line items and confirmation", youtubeId: "rFdACRn6HiM", thumbnailSrc: "/tutorial-thumbnails/W17.webp" },
      { code: "W18", title: "Receipt consent, drafts, failures and stored scans", youtubeId: "BHvVhwJsdzA", thumbnailSrc: "/tutorial-thumbnails/W18.webp" },
      { code: "W19", title: "CSV upload, types and mapping", youtubeId: "RVIo1rqasos", thumbnailSrc: "/tutorial-thumbnails/W19.webp" },
      { code: "W20", title: "CSV correction, confirmation and recovery", youtubeId: "9zyn1_HNrIw", thumbnailSrc: "/tutorial-thumbnails/W20.webp" },
    ],
  },
  {
    title: "Insights and planning",
    videos: [
      { code: "W21", title: "Expense comparisons, unusual expenses and finding feedback", thumbnailSrc: "/tutorial-thumbnails/W21.webp" },
      { code: "W22", title: "Reduction opportunities and simulations", thumbnailSrc: "/tutorial-thumbnails/W22.webp" },
      { code: "W23", title: "Recurring suggestions and schedules", thumbnailSrc: "/tutorial-thumbnails/W23.webp" },
      { code: "W24", title: "Payment calendar and recording payments", thumbnailSrc: "/tutorial-thumbnails/W24.webp" },
      { code: "W25", title: "Spending impact and AI item review", thumbnailSrc: "/tutorial-thumbnails/W25.webp" },
      { code: "W26", title: "Recovery target, daily goals and checkpoints", thumbnailSrc: "/tutorial-thumbnails/W26.webp" },
      { code: "W27", title: "Recovery scenarios and saved plans", thumbnailSrc: "/tutorial-thumbnails/W27.webp" },
      { code: "W28", title: "Month-end review", thumbnailSrc: "/tutorial-thumbnails/W28.webp" },
    ],
  },
  {
    title: "Account and help",
    videos: [
      { code: "W29", title: "Notifications and recovery alert preferences", thumbnailSrc: "/tutorial-thumbnails/W29.webp" },
      { code: "W30", title: "Ask FinSight, conversations and feedback", thumbnailSrc: "/tutorial-thumbnails/W30.webp" },
      { code: "W31", title: "Profile, security, sign-out and account deletion", thumbnailSrc: "/tutorial-thumbnails/W31.webp" },
      { code: "W32", title: "Appearance, guidance, help and recovery states", thumbnailSrc: "/tutorial-thumbnails/W32.webp" },
    ],
  },
];

/** Privacy-enhanced embed: no YouTube cookies until the viewer presses play. */
export const youtubeEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1`;
