import { enUseCases } from './en-use-cases'
import type { FeaturePagesCopy } from './types'

export const en: FeaturePagesCopy = {
  footerTitle: 'Tools',
  useCasesTitle: 'Use cases',
  highlightsLabel: 'Highlights',
  relatedTitle: 'More from Sneep Cut',
  faqTitle: 'Frequently asked questions',
  pages: {
    'ai-video-clipper': {
      navLabel: 'AI video clipper',
      metaTitle: 'AI video clipper — find the best moments | Sneep Cut',
      metaDescription:
        'Sneep Cut is an AI video clipper: it transcribes your video, picks the strongest moments and turns them into vertical clips with captions.',
      eyebrow: 'AI video clipper',
      title: 'An AI video clipper that finds the moments worth posting',
      lead:
        'Upload a long video and Sneep Cut listens to it, picks the parts that stand on their own and turns them into vertical clips with captions, ready to review and publish.',
      imageAlt: 'Ana shows a video on a phone with three clips coming out of it while Radu holds the film strip',
      highlights: [
        {
          title: 'Moments, not random cuts',
          text: 'The AI reads the transcript and selects segments with a clear start and end, so each clip makes sense without the rest of the video.'
        },
        {
          title: 'Vertical by default',
          text: 'Clips are cropped to 9:16 with the speaker kept in frame. Square 1:1 and landscape 16:9 are there when you need them.'
        },
        {
          title: 'Captions included',
          text: 'Every clip gets synced, editable captions with styles made for social feeds.'
        },
        {
          title: 'You stay in control',
          text: 'Review every clip, adjust what you want, then download it or schedule it to your networks.'
        }
      ],
      sections: [
        {
          title: 'What an AI video clipper does',
          paragraphs: [
            'Editing short clips by hand means watching the whole recording, writing down timestamps, cutting, reframing and typing captions. For a 40-minute interview that is easily an afternoon of work for three or four clips.',
            'An AI video clipper does the first pass for you. Sneep Cut transcribes the audio, looks for passages that hold together as a story (a clear point, a strong opinion, a practical tip) and prepares them as separate clips. You start from a shortlist instead of a blank timeline.'
          ]
        },
        {
          title: 'How Sneep Cut chooses the moments',
          paragraphs: [
            'The selection works on what is actually said in the video. Sneep Cut uses the transcript to find segments that begin and end cleanly, so a clip does not start in the middle of a sentence or stop before the punchline.',
            'You can tell it how many clips you want and add a short brief about what to look for, for example “practical tips only” or “the moments about pricing”. The brief steers the selection toward the topics that matter to your audience.'
          ]
        },
        {
          title: 'From selection to a finished clip',
          paragraphs: [
            'Each selected moment is reframed for vertical video and gets captions timed word by word. With a brand kit, your colors, fonts and watermark are applied automatically, so every clip looks like it came from the same channel.',
            'Most videos are processed in 2 to 5 minutes, and live progress shows what is happening along the way. When the clips are ready you can review them, change what you do not like, export them or publish them to Instagram, Facebook, TikTok and YouTube Shorts.'
          ]
        },
        {
          title: 'Who it is for',
          paragraphs: [
            'Sneep Cut works best with videos where people talk: interviews, podcasts, webinars, courses, sermons, talks and vlogs. Creators use it to keep posting short videos without spending every evening editing, and agencies use it to turn a client’s long recordings into a steady flow of clips.',
            'You can start on the free plan, which includes automatic moment selection, captions and 9:16 export, and move to a paid plan when you need more clips per project or Full HD export.'
          ]
        }
      ],
      faqs: [
        {
          question: 'What kind of videos work best?',
          answer:
            'Videos with speech: interviews, podcasts, presentations, lessons and vlogs. The AI selects moments from what is said, so clear audio gives the best results.'
        },
        {
          question: 'How many clips do I get from one video?',
          answer:
            'You choose how many clips to request. The free plan allows up to 5 clips per project and the Creator plan up to 15.'
        },
        {
          question: 'Can I change a clip the AI selected?',
          answer:
            'Yes. Every clip can be reviewed and adjusted before you download or publish it. Nothing is posted without your confirmation.'
        },
        {
          question: 'Which file formats can I upload?',
          answer: 'MP4, MOV, WebM and MKV. You can also pick videos from your YouTube channel.'
        }
      ]
    },
    'long-video-to-shorts': {
      navLabel: 'Long video to short clips',
      metaTitle: 'Turn long videos into short clips | Sneep Cut',
      metaDescription:
        'Turn one long video into several short clips for Reels, TikTok and YouTube Shorts: moments selected, cropped vertically and captioned.',
      eyebrow: 'Long video to short clips',
      title: 'Turn one long video into a week of short clips',
      lead:
        'A single interview, podcast or webinar holds many short videos. Sneep Cut finds them, cuts them to vertical format and adds captions, so one recording can feed your feeds for days.',
      imageAlt: 'Radu cuts a film strip while Ana arranges the clips on a shelf',
      highlights: [
        {
          title: 'Several clips per video',
          text: 'Request the number of clips you need: up to 5 per project on Free and up to 15 on Creator.'
        },
        {
          title: 'Ready for every feed',
          text: '9:16 for Reels, TikTok and Shorts at 1080 × 1920, plus 1:1 and 16:9 when a post needs them.'
        },
        {
          title: 'Batch processing',
          text: 'Paid plans can process several videos in one go: up to 5 on Creator and 20 on Pro.'
        }
      ],
      sections: [
        {
          title: 'Why repurpose long videos',
          paragraphs: [
            'Short vertical videos are the format most social networks push today, but filming something new every day is hard to sustain. The long content you already have, from live streams to client calls turned into case studies, is full of moments that work well on their own.',
            'Repurposing means each recording does more work. One 45-minute episode can become a full week of posts on Instagram, TikTok, Facebook and YouTube Shorts without any new filming.'
          ]
        },
        {
          title: 'How the conversion works',
          paragraphs: [
            'Upload the file or pick a video from your YouTube channel. Sneep Cut transcribes it, selects the moments, crops them to vertical with the subject kept in frame and adds captions. Most videos are ready in 2 to 5 minutes.',
            'Each clip keeps a clean beginning and end, so it can be posted without context. You can add a short brief to steer the selection, for example toward tips, stories or answers to common questions.'
          ]
        },
        {
          title: 'Keep the same look on every clip',
          paragraphs: [
            'Clips cut from the same video should look like they belong together. A brand kit applies your colors, fonts and watermark to every clip automatically, and caption styles stay consistent across the whole batch.',
            'When you work for several brands, each one can keep its own style, so an agency can switch between clients without redoing settings.'
          ]
        },
        {
          title: 'Which recordings make the best clips',
          paragraphs: [
            'The more a video is driven by speech, the more good moments it holds. Interviews and podcasts work especially well because guests answer one question at a time, and each answer is often a clip on its own. Webinars and courses give you practical tips, and talks or sermons give you strong, quotable ideas.',
            'Clear audio matters more than perfect video. A recording with a good microphone and little background noise gives a more accurate transcript, which leads to better moment selection and captions. Recordings with long silent stretches, music only or several people talking over each other give the AI less to work with.',
            'A simple habit helps a lot: when you record, answer questions in complete sentences and repeat the question in your answer. Those passages are the easiest to turn into clips that make sense without the rest of the video.'
          ]
        },
        {
          title: 'From clips to posts',
          paragraphs: [
            'After review you can download the clips or publish them directly. Connect Instagram, Facebook, TikTok and YouTube, then post right away or spread the clips over the week from the content calendar.'
          ]
        }
      ],
      faqs: [
        {
          question: 'How long can the original video be?',
          answer:
            'Sneep Cut is built for long recordings such as interviews, podcasts and webinars. Your plan’s monthly usage allowance, shown in the app, determines how much video you can process.'
        },
        {
          question: 'How long are the generated clips?',
          answer:
            'Each clip follows a complete moment from the video, so its length depends on the content. Typical clips fit the limits of Reels, TikTok and YouTube Shorts.'
        },
        {
          question: 'Can I process several videos at once?',
          answer: 'Yes, on paid plans: up to 5 videos per batch on Creator and up to 20 on Pro.'
        },
        {
          question: 'What resolution are the clips exported in?',
          answer: '720p on the free plan and Full HD 1080p on Creator and above.'
        }
      ]
    },
    'auto-captions': {
      navLabel: 'Automatic captions',
      metaTitle: 'Automatic captions for short videos | Sneep Cut',
      metaDescription:
        'Add automatic, word-synced captions to your short videos. Sneep Cut transcribes the speech and styles the captions for Reels, TikTok and Shorts.',
      eyebrow: 'Automatic captions',
      title: 'Automatic captions, synced word by word',
      lead:
        'Many people watch short videos with the sound off. Sneep Cut transcribes your video and adds captions timed to every word, with styles that are easy to read on a phone.',
      imageAlt: 'A vertical video frame with large captions over the speaker',
      highlights: [
        {
          title: 'Synced transcription',
          text: 'Captions follow the speech word by word instead of appearing as long blocks of text.'
        },
        {
          title: 'Dynamic emphasis',
          text: 'Key words can be highlighted so the message reads at a glance.'
        },
        {
          title: 'Editable',
          text: 'Fix a name or a technical term in the text and the captions update.'
        },
        {
          title: 'Your style',
          text: 'Choose a caption style, or use your brand kit’s fonts and colors.'
        }
      ],
      sections: [
        {
          title: 'Why captions matter on short videos',
          paragraphs: [
            'In a feed, a video has a second or two to catch attention, often while the phone is muted. Captions let people follow what you say without turning the sound on, and they make your videos accessible to viewers who are deaf or hard of hearing.',
            'Captions also keep attention on the screen. When words appear in rhythm with the speech, viewers keep reading, and that helps them stay until the end of the clip.'
          ]
        },
        {
          title: 'How automatic captions work in Sneep Cut',
          paragraphs: [
            'When you upload a video, Sneep Cut transcribes the audio and keeps the timing of every word. Captions are generated from that transcript and placed on each clip, so they are already synced when the clip is ready.',
            'Transcription follows the language spoken in the video, so you can caption content in English, Romanian and other languages without a separate tool.'
          ]
        },
        {
          title: 'Styles made for social feeds',
          paragraphs: [
            'Caption styles are designed for vertical video: large, high-contrast text that stays readable on a small screen and out of the way of the speaker. Paid plans include more caption styles.',
            'With a brand kit, captions use your fonts and colors automatically, so every clip matches the rest of your content.'
          ]
        },
        {
          title: 'Tips for accurate captions',
          paragraphs: [
            'Automatic captions are only as good as the audio they come from. A microphone close to the speaker, a quiet room and one person talking at a time give the most accurate transcript. Background music under the voice makes words harder to recognise, so keep it low or add it after recording.',
            'Before you publish, read the captions once. Names of people and brands, product names and specialist terms are the words most likely to need a correction, and fixing them takes seconds in the text.',
            'Keep captions short on screen. A few words at a time are easier to follow on a phone than full sentences, and they leave the speaker’s face visible.'
          ]
        },
        {
          title: 'Part of the whole workflow',
          paragraphs: [
            'Captions are not a separate export step. They are created together with the clip selection and vertical crop, and they come with the clip when you download it or publish it to Instagram, Facebook, TikTok and YouTube Shorts.'
          ]
        }
      ],
      faqs: [
        {
          question: 'Can I edit the generated captions?',
          answer: 'Yes. You can correct any word before exporting, for example names, brands or technical terms.'
        },
        {
          question: 'Which languages are supported?',
          answer:
            'Captions follow the language spoken in the video. The Sneep Cut interface is available in English and Romanian.'
        },
        {
          question: 'Are captions included on the free plan?',
          answer: 'Yes. Automatic captions are part of every plan, including Free. Paid plans add more caption styles.'
        },
        {
          question: 'Are captions burned into the video?',
          answer:
            'Yes, captions are part of the exported clip, so they show on every network, including those that do not read subtitle files.'
        }
      ]
    },
    'youtube-to-shorts': {
      navLabel: 'YouTube video to Shorts',
      metaTitle: 'Turn your YouTube videos into Shorts | Sneep Cut',
      metaDescription:
        'Pick videos from your YouTube channel and turn them into Shorts, Reels and TikToks with AI-selected moments, vertical crop and captions.',
      eyebrow: 'YouTube video to Shorts',
      title: 'Turn the videos on your YouTube channel into Shorts',
      lead:
        'Your channel already holds hours of good material. Pick the videos you want, and Sneep Cut turns their best moments into vertical clips for YouTube Shorts, Reels and TikTok.',
      imageAlt: 'Ana puts a video into a laptop while Radu shows her his phone',
      highlights: [
        {
          title: 'Pick from your channel',
          text: 'Connect your channel and choose up to 10 videos at a time. No downloading and re-uploading.'
        },
        {
          title: 'Moments selected for you',
          text: 'The AI finds the parts of each video that work as standalone Shorts.'
        },
        {
          title: 'Back to YouTube, and beyond',
          text: 'Publish the clips as Shorts, and also to Instagram, Facebook and TikTok.'
        }
      ],
      sections: [
        {
          title: 'Why turn long YouTube videos into Shorts',
          paragraphs: [
            'Shorts reach people who have never seen your channel. A good Short is a sample of what your long videos offer, and it gives new viewers a reason to subscribe and watch more.',
            'Your back catalogue is the easiest place to start. Videos you published months ago still contain tips, stories and opinions that can work again as short clips.'
          ]
        },
        {
          title: 'How it works with your channel',
          paragraphs: [
            'Instead of pasting links, you connect your YouTube channel and select the videos you want to use, up to 10 at a time. Sneep Cut only works with videos from your own channel, so you always have the rights to what you clip.',
            'Each selected video goes through the same process as an upload: transcription, selection of moments, vertical crop with the speaker in frame and synced captions.'
          ]
        },
        {
          title: 'Shorts that look like your channel',
          paragraphs: [
            'A brand kit keeps your colors, fonts and watermark on every Short, so viewers recognise your content in the feed. Caption styles are made for vertical video and stay readable on a phone.'
          ]
        },
        {
          title: 'Where to find Shorts in your back catalogue',
          paragraphs: [
            'Start with the videos that already performed well. Their topics have proven interest, and a short version can bring that interest to people who never saw the original.',
            'Look for videos with lists, steps and answers: “three mistakes”, “how I do it”, a question from a viewer. Each item on a list or each answer is often a complete Short. Q&A videos and live streams are also full of short, direct answers.',
            'Evergreen content is the safest choice. A tip that is still true today makes a good Short even if the original video is two years old, while news and time-sensitive videos are better left as they are.'
          ]
        },
        {
          title: 'Publish everywhere from one place',
          paragraphs: [
            'Once the clips are ready, review them and publish them back to YouTube as Shorts. The same clips can go to Instagram Reels, Facebook and TikTok, right away or on a schedule.'
          ]
        }
      ],
      faqs: [
        {
          question: 'Can I paste a link to any YouTube video?',
          answer:
            'No. Sneep Cut works with videos from your own channel, which you select after connecting it. This keeps clipping limited to content you own.'
        },
        {
          question: 'How many videos can I select at once?',
          answer: 'Up to 10 videos from your channel in one selection.'
        },
        {
          question: 'Do I need to download my videos first?',
          answer: 'No. You choose them from your channel inside Sneep Cut. You can still upload files from your computer if you prefer.'
        },
        {
          question: 'Can I publish the Shorts directly to YouTube?',
          answer: 'Yes. Connect your YouTube account and publish right away or schedule the Shorts for later.'
        }
      ]
    },
    'schedule-social-posts': {
      navLabel: 'Schedule social media posts',
      metaTitle: 'Schedule Reels, TikToks and Shorts in one place | Sneep Cut',
      metaDescription:
        'Publish and schedule your clips to Instagram, Facebook, TikTok and YouTube Shorts from one calendar, right after you create them in Sneep Cut.',
      eyebrow: 'Social media scheduling',
      title: 'Schedule your clips to every network from one calendar',
      lead:
        'Creating clips is only half the job. Sneep Cut lets you publish or schedule them to Instagram, Facebook, TikTok and YouTube Shorts from the same place you made them.',
      imageAlt: 'Ana sends paper planes from a phone while Radu watches them fly',
      highlights: [
        {
          title: 'Four networks',
          text: 'Instagram, Facebook, TikTok and YouTube Shorts, connected once.'
        },
        {
          title: 'Now or later',
          text: 'Publish immediately or pick a day and time for each post.'
        },
        {
          title: 'One calendar',
          text: 'See the whole week of posts at a glance and move them when plans change.'
        }
      ],
      sections: [
        {
          title: 'Why schedule instead of posting by hand',
          paragraphs: [
            'Posting consistently matters more than posting a lot. When clips are scheduled in advance, a busy week does not break your rhythm, and each network gets content at the times that suit your audience.',
            'Doing it by hand means downloading each clip, opening four apps and writing the same post four times. Scheduling from one place removes that repetitive work.'
          ]
        },
        {
          title: 'From clip to scheduled post',
          paragraphs: [
            'When your clips are ready, choose where each one should go and when. Write the text for the post, pick the networks, and either publish right away or set a date and time.',
            'Because scheduling lives next to clip creation, there is no export and re-upload step in between: the clip you approved is the clip that gets posted.'
          ]
        },
        {
          title: 'Plan the week in the content calendar',
          paragraphs: [
            'The content calendar on the Pro plan shows every scheduled post by day, across all networks. You can spread the clips from one long video over the week, fill gaps and reschedule a post when something more urgent comes up.',
            'Agencies and teams get a clear view of what goes out for each brand and when.'
          ]
        },
        {
          title: 'A simple weekly plan from one video',
          paragraphs: [
            'One long recording is enough for a full week. Make five or six clips from it, then schedule one clip a day instead of posting them all at once. Each clip gets its own moment in the feed, and your audience sees you every day.',
            'Post the same clip to several networks at once. Keep the post text short and direct: on a phone, most people decide in the first second whether to keep watching, and the clip itself should carry the message.',
            'Keep a fixed rhythm, for example a new long video every Monday and its clips from Tuesday to Sunday. When filming and posting follow the same plan every week, consistency stops depending on how busy you are.'
          ]
        },
        {
          title: 'Connected accounts, kept safe',
          paragraphs: [
            'You connect each network through its official sign-in and can disconnect it at any time. Data is encrypted in transit and at rest, and you can export or delete your data whenever you want.'
          ]
        }
      ],
      faqs: [
        {
          question: 'Which networks can I publish to?',
          answer: 'Instagram, Facebook, TikTok and YouTube Shorts.'
        },
        {
          question: 'Can I publish clips I did not make in Sneep Cut?',
          answer: 'Yes. Clips made in Sneep Cut go straight to the post, and you can also upload your own media when you create a post.'
        },
        {
          question: 'Which plan includes the content calendar?',
          answer: 'The content calendar is part of the Pro plan. See the pricing page for everything each plan includes.'
        },
        {
          question: 'Can I change a scheduled post?',
          answer: 'Yes. You can edit, reschedule or cancel a post before it is published.'
        }
      ]
    },
    ...enUseCases
  }
}
