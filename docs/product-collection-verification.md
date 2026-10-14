# Collection and improvement verification — 2026-10-14

This records synthetic local verification, not production deployment or real provider quality claims. The final requested product admission limit is 200 clips per project.

| Area | Executed evidence |
| --- | --- |
| Collection domain | TestLargeCollectionsRetainEveryAssetAndTimelineEntry passes 80, 125, 250 assets (250 preserves legacy rendering); byte and duration protections remain. |
| Persistence | TestQueueLargeCollectionsCreatesExactlyOneJobAndCharge passed 5, 10, 80, 125 asset manifests and concurrent duplicate submission on sneepcut_integration_test. |
| 200 admission / legacy | TestTwoHundredClipAdmissionPreservesExistingLargerProjects passed: 200 accepted, idempotent retry accepted, new 201st rejected, synthetic legacy 201 retained and complete manifest queued. |
| Analysis | TestStorySemanticAnalysisBatchesOneHundredTwentyFiveSources processes actual synthetic source frames in seven bounded requests using a fixture provider; all 125 source IDs remain. External-model semantic quality is not implied. |
| Export over 100 | TestStoryAssemblyOverOneHundredEntriesUsesBoundedInputsAndExactClocks decodes 125 segments, 8 chunks per stream, 9.133 s video / 9.125 s audio; final red frame preserved. |
| Queue recovery | frontend/tests/story-large-queue.test.mjs passes 80, 125, 200 selections, max two transfers, independent transfer/registration retry, nine busy attempts, queued and active cancellation, stable order, and complete URL cleanup. |
| Browser | story.browser.mjs passed 5 and 125 mock uploads, three stages, hidden diagnostics/scene stack, intentional Edit clips, locks, alternate take, comparison/restore, refresh, mounted import/story state, desktop and 390 px layouts. |
| Processing browser | story-processing.browser.mjs passed honest indeterminate phases, failure/cancellation, no raw diagnostics, 320 px/reduced motion, Romanian, and existing legacy job percentages. |
| Smoother flow | Full story Go package passes. TestImproveFlowReplansKnownMomentsAndReportsIdenticalOutput verifies known alternate selection and no duplicate render on unchanged timeline. Narration tests preserve locked visuals and exact audio/word schedules, including no-change. |
| Smoother transitions | TestStoryTransitionActionChangesActualFramesAndPreservesAudio changes boundary RGB [0,1,255] to [1,0,2], with byte-identical decoded audio and unchanged 2.000 s duration; locked/already-smoothed/word-crossing joins yield no-change. The same actual-media test now covers narration default hard cuts with continuous original voice. |
| No-change persistence | TestNoChangeImprovementRetainsReadyVersionAndExplainsOutcome passes on isolated database, retaining previous ready version and balance. |
| Concurrent registration response | TestProjectResponseKeepsConsistentStateDuringConcurrentRegistration passes on isolated PostgreSQL: a concurrent committed source does not turn registration into 409, and response assets/token remain one snapshot. Existing authenticated HTTP contract also passes. |
| Narration analysis replay | TestNarrationSemanticBatchesReuseVisualCacheAndInvalidateChangedVoice passes with actual frames: 21 visual sources use 2 calls, replay uses 0 extra, changed narration invalidates both batches. Ordinary semantic cache regression passes. |
| Retry window | TestRedisNonceAtomicNXExpiryAndSharedLimits and TestUploadBusyUsesRemainingWindowWithoutChangingAllowance pass; media Retry-After reads existing Redis TTL and rounds up, while missing optional TTL uses conservative one hour. |

The hourly API limits remain: transfers and registrations 60/hour, authorizations 120/hour. After automatic approval review rejected removal and the finite 400/hour alternative, the user explicitly chose Keep current hourly allowance. No live throttle policy was changed. docs/patches/upload-request-throttle.patch retains the unselected alternative and unexecuted proposed tests for provenance. Consequently a rapid authenticated 80/125/200 clip upload-to-export run is not verified end to end; mocked UI, real processor, and real isolated persistence coverage must not be presented as that full chain.

Browser screenshots: frontend/test-results/product-evidence/{story-125-desktop,story-125,story-five-desktop,story-five}.png and frontend/test-results/product-evidence/story-processing/*.png. These browser fixtures mock media URLs and verify layout/state, not actual playback; exported media is decoded in the actual FFmpeg tests above.

The initial storage check exceeded the generated-output budget. After preserving evidence and removing task scratch and regenerable Go build cache, the final check passed: 26.0 MiB generated, 1772.2 MiB cache and 5503.4 MiB checkout. User media, persistent databases, tools and unrelated caches were preserved.
