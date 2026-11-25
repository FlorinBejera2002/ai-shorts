import type { AlternativePageId, FeaturePageCopy } from './types'

const CHECKED =
  'Competitor details were checked on their public pricing and help pages on 25 November 2026. Plans change often, so check their site for current details. Product names belong to their owners; Sneep Cut is not affiliated with them.'

const COLUMNS = (competitor: string): [string, string, string] => ['Feature', 'Sneep Cut', competitor]

export const enAlternatives: Record<AlternativePageId, FeaturePageCopy> = {
  'alternatives/opus-clip': {
    navLabel: 'OpusClip alternative',
    metaTitle: 'OpusClip alternative with Romanian interface | Sneep Cut',
    metaDescription:
      'Looking for an OpusClip alternative? Compare Sneep Cut and OpusClip on free plans, publishing, brand kits and video sources, with facts checked in November 2026.',
    eyebrow: 'OpusClip alternative',
    title: 'Sneep Cut as an OpusClip alternative',
    lead:
      'OpusClip is one of the best-known AI clipping tools. If you are comparing options, here is an honest look at where Sneep Cut differs, where OpusClip does more, and how to choose.',
    imageAlt: 'Ana shows a video on a phone with three clips coming out of it while Radu holds the film strip',
    highlights: [
      {
        title: 'Romanian and English',
        text: 'The whole Sneep Cut interface is available in Romanian as well as English.'
      },
      {
        title: 'Publishing to four networks',
        text: 'Instagram, Facebook, TikTok and YouTube Shorts from the same place you make the clips.'
      },
      {
        title: 'An EU company',
        text: 'Sneep Cut is operated from Romania, with data handled under GDPR.'
      }
    ],
    comparison: {
      title: 'Sneep Cut and OpusClip side by side',
      columns: COLUMNS('OpusClip'),
      rows: [
        {
          label: 'Free plan',
          ours: 'Yes: up to 5 clips per project, captions, 720p export',
          theirs: 'Yes: 60 processing minutes per month; caption templates carry a watermark'
        },
        {
          label: 'Paid plans',
          ours: 'Creator, Pro and Agency (see the pricing page)',
          theirs: 'Starter $15/month, Pro $29/month, Business on request'
        },
        {
          label: 'Publishing and scheduling',
          ours: 'Instagram, Facebook, TikTok and YouTube Shorts; content calendar on Pro',
          theirs: 'Direct posting to YouTube, TikTok and Instagram from Starter; scheduler and more networks, including Facebook, from Pro'
        },
        {
          label: 'Brand kit',
          ours: 'From Creator, with separate kits per brand',
          theirs: '1 template on Free and Starter, up to 4 on Pro'
        },
        {
          label: 'Video sources',
          ours: 'Upload (MP4, MOV, WebM, MKV) or videos from your own YouTube channel',
          theirs: 'Upload plus links from YouTube, Google Drive, Zoom and many other services, depending on plan'
        },
        {
          label: 'Romanian speech',
          ours: 'Supported',
          theirs: 'Listed as supported (in beta)'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Where Sneep Cut is different',
        paragraphs: [
          'Sneep Cut is built by a small team in Romania for creators and businesses in Romania and the rest of Europe. The whole interface is available in Romanian and English. If your audience, your team or your clients work in Romanian, that makes everyday use simpler.',
          'Publishing is part of the core workflow. Once a clip is ready you can publish or schedule it to Instagram, Facebook, TikTok and YouTube Shorts without exporting and uploading it elsewhere, and the content calendar on Pro shows the whole week across networks.',
          'For agencies and creators with more than one brand, Sneep Cut keeps a separate brand kit for each one, with colors, fonts, caption style and watermark.'
        ]
      },
      {
        title: 'Where OpusClip does more',
        paragraphs: [
          'OpusClip accepts videos from many more sources, including links from Google Drive, Zoom, Vimeo and other services, while Sneep Cut works with uploaded files and videos from your own YouTube channel.',
          'OpusClip also publishes to more networks on its higher plans, such as LinkedIn, X and Pinterest, and offers a Business plan for large teams. If those sources or networks are central to your work, OpusClip may be the better fit.'
        ]
      },
      {
        title: 'How to choose',
        paragraphs: [
          'The simplest test is to run the same video through both tools. Both have free plans, so you can compare which moments each one selects, how the captions read and how much you need to fix before posting.',
          'Choose Sneep Cut if you want a Romanian and English interface, publishing to the four main networks from one place and an EU-based provider. Choose OpusClip if you rely on many import sources or need networks beyond Instagram, Facebook, TikTok and YouTube.'
        ]
      },
      {
        title: 'Switching from OpusClip',
        paragraphs: [
          'There is nothing to migrate: create a free account, upload a recent video or pick one from your YouTube channel and compare the results. If you use a brand template in OpusClip, recreate the same colors, fonts and watermark in a Sneep Cut brand kit so your clips keep the same look.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Is Sneep Cut free like OpusClip?',
        answer: 'Sneep Cut has a free plan with up to 5 clips per project, automatic captions and 720p export. Paid plans add Full HD, more clips and brand kits.'
      },
      {
        question: 'Can I import YouTube links into Sneep Cut?',
        answer:
          'Sneep Cut works with videos from your own YouTube channel, which you select after connecting it, rather than pasted links to any video.'
      },
      {
        question: 'Can I use Sneep Cut in Romanian?',
        answer: 'Yes. The whole interface is available in Romanian and English, and captions follow the language spoken in the video.'
      },
      {
        question: 'Where can I see Sneep Cut prices?',
        answer: 'All plans and current prices are on the Sneep Cut pricing page.'
      }
    ]
  },
  'alternatives/vizard': {
    navLabel: 'Vizard alternative',
    metaTitle: 'Vizard alternative for short clips | Sneep Cut',
    metaDescription:
      'Comparing Vizard and Sneep Cut? See how the free plans, publishing, brand kits and languages differ, with competitor details checked in November 2026.',
    eyebrow: 'Vizard alternative',
    title: 'Sneep Cut as a Vizard alternative',
    lead:
      'Vizard and Sneep Cut both turn long videos into short clips with captions and help you post them. Here is a fair comparison of what each offers, so you can pick the one that suits your workflow.',
    imageAlt: 'Radu cuts a film strip while Ana arranges the clips on a shelf',
    highlights: [
      {
        title: 'Built for Romanian and English',
        text: 'The whole Sneep Cut interface works in Romanian and English.'
      },
      {
        title: 'Clips that stay',
        text: 'Your projects are kept in your account instead of expiring after a few days.'
      },
      {
        title: 'Simple plans',
        text: 'Plans are described in clips and features, with usage shown as a percentage in the app.'
      }
    ],
    comparison: {
      title: 'Sneep Cut and Vizard side by side',
      columns: COLUMNS('Vizard'),
      rows: [
        {
          label: 'Free plan',
          ours: 'Yes: up to 5 clips per project, captions, 720p export',
          theirs: 'Yes: 60 credits per month, 720p export, videos up to 60 minutes'
        },
        {
          label: 'Storage on the free plan',
          ours: 'Projects stay in your account until you delete them',
          theirs: 'Videos expire after 3 days'
        },
        {
          label: 'Paid plans',
          ours: 'Creator, Pro and Agency (see the pricing page)',
          theirs: 'Creator and Business, billed with credits (see Vizard’s pricing page)'
        },
        {
          label: 'Publishing and scheduling',
          ours: 'Instagram, Facebook, TikTok and YouTube Shorts; content calendar on Pro',
          theirs: 'Scheduling on all plans: 1 social account on Free, 6 on Creator, 20 on Business'
        },
        {
          label: 'Brand kit',
          ours: 'From Creator, with separate kits per brand',
          theirs: 'Listed on every plan'
        },
        {
          label: 'Maximum export quality',
          ours: 'Full HD 1080p on paid plans',
          theirs: 'Up to 4K on paid plans'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Where Sneep Cut is different',
        paragraphs: [
          'Sneep Cut is made in Romania and its interface is fully available in Romanian and English. For creators, churches, schools and businesses that work in Romanian, that means no guessing in menus.',
          'Clips you create stay in your account. On Vizard’s free plan, videos expire after three days, so you need to download what you want to keep. Sneep Cut lets you come back to a project later, review clips again and schedule them when you are ready.',
          'Plans are described in clips per project, export quality and features, and your monthly usage is shown as a simple percentage in the app.'
        ]
      },
      {
        title: 'Where Vizard does more',
        paragraphs: [
          'Vizard exports up to 4K on its paid plans and accepts longer uploads, up to 10 hours on paid plans. It also allows several social accounts per plan, up to 20 on Business, and lists a brand kit and team invitations already on its free plan.',
          'If you work with very long recordings, need 4K output or manage many social accounts at once, Vizard may suit you better.'
        ]
      },
      {
        title: 'How to choose',
        paragraphs: [
          'Both tools have free plans, so the fairest test is to process the same recording in each and compare the selected moments, the captions and the time you spend fixing them.',
          'Choose Sneep Cut if a Romanian interface, clips that stay in your account and publishing to Instagram, Facebook, TikTok and YouTube Shorts from one place matter most. Choose Vizard if 4K exports, very long uploads or many connected accounts are essential.'
        ]
      },
      {
        title: 'Moving from Vizard',
        paragraphs: [
          'Start with a free Sneep Cut account and one of your recent videos. Recreate your brand colors, fonts and watermark in a brand kit, connect your networks and compare a week of clips side by side before deciding.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Does Sneep Cut use credits like Vizard?',
        answer:
          'No. Each plan has a monthly usage allowance shown as a percentage in the app, plus limits such as clips per project and export quality.'
      },
      {
        question: 'Does Sneep Cut export in 4K?',
        answer: 'No. Sneep Cut exports in 720p on the free plan and Full HD 1080p on paid plans.'
      },
      {
        question: 'Can I keep my clips on the free plan?',
        answer: 'Yes. Projects stay in your Sneep Cut account; you can also download clips whenever you want.'
      },
      {
        question: 'Is the Sneep Cut interface available in Romanian?',
        answer: 'Yes. Sneep Cut is fully available in Romanian and English.'
      }
    ]
  },
  'alternatives/klap': {
    navLabel: 'Klap alternative',
    metaTitle: 'Klap alternative with a free plan | Sneep Cut',
    metaDescription:
      'Looking for a Klap alternative with a free plan? Compare Sneep Cut and Klap on pricing, publishing, languages and limits, checked in November 2026.',
    eyebrow: 'Klap alternative',
    title: 'Sneep Cut as a Klap alternative',
    lead:
      'Klap is a popular paid tool for turning long videos into shorts. If you want to start without paying, or work in Romanian, Sneep Cut may be a better fit. Here is how the two compare.',
    imageAlt: 'Ana sticks a clip onto a calendar that Radu is holding',
    highlights: [
      {
        title: 'A real free plan',
        text: 'Create, download and keep clips on the free plan, not just preview them.'
      },
      {
        title: 'Romanian and English',
        text: 'Use the whole app in Romanian or English.'
      },
      {
        title: 'Four networks, one place',
        text: 'Publish or schedule to Instagram, Facebook, TikTok and YouTube Shorts.'
      }
    ],
    comparison: {
      title: 'Sneep Cut and Klap side by side',
      columns: COLUMNS('Klap'),
      rows: [
        {
          label: 'Free plan',
          ours: 'Yes: up to 5 clips per project, captions, 720p export',
          theirs: 'No free plan; a free trial on 1 video, downloading or posting needs a paid plan'
        },
        {
          label: 'Paid plans',
          ours: 'Creator, Pro and Agency (see the pricing page)',
          theirs: 'Basic $29/month, Pro $79/month, Pro+ $189/month; half price with yearly billing'
        },
        {
          label: 'How usage is counted',
          ours: 'Monthly usage allowance, shown as a percentage in the app',
          theirs: 'Clips per month: 100, 300 or 1,000'
        },
        {
          label: 'Publishing and scheduling',
          ours: 'Instagram, Facebook, TikTok and YouTube Shorts; content calendar on Pro',
          theirs: 'TikTok, YouTube, Instagram, LinkedIn and Facebook on every paid plan'
        },
        {
          label: 'Caption languages',
          ours: 'Follow the language spoken in the video',
          theirs: '99+ languages'
        },
        {
          label: 'Interface languages',
          ours: 'Romanian and English',
          theirs: 'Not listed on the pricing page'
        }
      ],
      note: CHECKED
    },
    sections: [
      {
        title: 'Where Sneep Cut is different',
        paragraphs: [
          'The biggest difference is how you start. Klap offers a free trial on one video, but downloading or posting clips requires a paid plan. Sneep Cut has a free plan on which you can create clips, download them and keep using the tool before deciding whether to pay.',
          'Sneep Cut is made in Romania and works fully in Romanian and English, which helps teams and audiences that work in Romanian. Publishing to Instagram, Facebook, TikTok and YouTube Shorts is part of the same workflow as creating the clips.',
          'Brand kits keep colors, fonts, caption style and watermark consistent, with a separate kit for each brand you manage.'
        ]
      },
      {
        title: 'Where Klap does more',
        paragraphs: [
          'Klap includes posting and scheduling, unlimited social accounts and LinkedIn on all of its paid plans, and lists caption support in more than 99 languages. It also offers an API for developers and accepts source videos of up to three hours.',
          'If you need LinkedIn publishing, a developer API or a high fixed number of clips per month, Klap is worth considering.'
        ]
      },
      {
        title: 'How to choose',
        paragraphs: [
          'If you want to test thoroughly before paying, start with Sneep Cut’s free plan and compare it with Klap’s one-video trial on the same recording.',
          'Choose Sneep Cut for a free plan you can create and download clips on, a Romanian and English interface and publishing to the four main short-video networks. Choose Klap if LinkedIn, an API or a large monthly clip allowance is the priority.'
        ]
      },
      {
        title: 'Getting started',
        paragraphs: [
          'Create a free Sneep Cut account, upload a recent video or pick one from your YouTube channel, and review the clips. Connect your networks when you are ready to publish, and move to a paid plan only when you need Full HD, more clips per project or brand kits.'
        ]
      }
    ],
    faqs: [
      {
        question: 'Is Sneep Cut cheaper than Klap?',
        answer:
          'Sneep Cut has a free plan, while Klap starts at $29 per month (or $14.50 per month billed yearly) after a one-video trial. Current Sneep Cut prices are on the pricing page.'
      },
      {
        question: 'Can I publish to LinkedIn from Sneep Cut?',
        answer: 'Not at the moment. Sneep Cut publishes to Instagram, Facebook, TikTok and YouTube Shorts.'
      },
      {
        question: 'Does Sneep Cut count clips per month?',
        answer: 'Each plan has a monthly usage allowance shown as a percentage in the app, plus a limit of clips per project.'
      },
      {
        question: 'Do Sneep Cut clips have a watermark?',
        answer: 'You can add your own watermark through a brand kit. Exports without Sneep Cut branding are part of the Agency plan.'
      }
    ]
  }
}
