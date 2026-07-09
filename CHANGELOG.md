# Changelog

## [0.6.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.5.0...peak-district-downhill-v0.6.0) (2026-07-09)


### Features

* add coverage reporting with enforced CI thresholds ([#219](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/219)) ([9107881](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/9107881f88ebd42f6087d9bf37ca4b9037d6e851))
* add gear change mechanic ([#62](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/62)) ([#225](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/225)) ([4102f5f](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/4102f5f679efae0d74b4b64457e06368e1005a60))
* add heather and bracken shrub scatter layers to moorland scenery ([#216](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/216)) ([e4b69ce](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/e4b69ce70fd72188500d769f83bb8e8a8fb5ff30))
* add height-based ground mist layered over distance fog ([#213](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/213)) ([ec42bd1](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/ec42bd1999ac74bece2699d6d5f8d4dd0154dc4c)), closes [#156](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/156)
* add persistent tyre track trail behind the bike ([#218](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/218)) ([0925127](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/09251272a2c84d779b89d9753b31b6de22ea42a3))
* bake real building footprints and water features from OpenStreetMap ([#223](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/223)) ([1dd4de7](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/1dd4de7c98835fe8103610a4a2c9fbedc6444f6f))
* chunk the terrain mesh into THREE.LOD tiles ([#71](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/71)) ([#227](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/227)) ([a08316a](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/a08316a3ca776f13493bbfa2a3e13ae8e66d75ba))
* free-look camera via mouse/touch drag ([#39](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/39)) ([#222](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/222)) ([dc3a936](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/dc3a9364eade1465694a6b665646dbfc96f20040))
* give the ridden trail chunky, rocky cross-section relief ([#215](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/215)) ([2e1e2e8](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/2e1e2e846f55791398377d704ce4c7b22b43750a))
* give the ridden trail chunky, rocky cross-section relief ([#217](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/217)) ([40ae86a](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/40ae86a70c966aa83ae66b13388680e7fcad9d2c))


### Bug Fixes

* sample terrain height on the same triangulation the mesh renders ([#226](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/226)) ([2ac036a](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/2ac036afa5935bafe64d4c0706a6e810f1a02421))

## [0.5.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.4.0...peak-district-downhill-v0.5.0) (2026-07-08)


### Features

* add pre-run course-select overlay with Peak District overview map ([#191](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/191)) ([#193](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/193)) ([92ee9b4](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/92ee9b4c4bb5c86b514f47281578aa6623e032a0))
* **camera:** pull chase camera back and up to show more scenery ([#207](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/207)) ([578d682](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/578d68208a2363b343cf6eaef8a46e48461e9612))
* regenerate landcover and paths data from real OSM sources ([#202](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/202)) ([3506dea](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/3506dea64af189340fe3e0f056ea5fa327793bed))
* **scenery:** procedural grass sprites + reusable scatter pipeline ([#209](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/209)) ([1e78bde](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/1e78bde40130259e05e58d070ed55e59de84b9a0))
* **terrain:** bake real LIDAR tree data for Cut Gate ([#204](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/204)) ([4f76f8e](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/4f76f8e4355d8556ebb6465f448ccd4ad5ca7eed))


### Bug Fixes

* stop jump impulse using absolute world position as its lever arm ([#200](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/200)) ([bfdcb5b](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/bfdcb5bdeec3a544906d9439c8cefc835dbe6d48)), closes [#199](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/199)

## [0.4.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.3.0...peak-district-downhill-v0.4.0) (2026-07-05)


### Features

* add dynamic rider pose driven by slope/speed/pedal/brake ([#126](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/126)) ([#127](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/127)) ([46a3c89](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/46a3c8928dd9e5e70d3d150187134278678c09ad))
* add opt-in tilt steering for smartphones ([#128](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/128)) ([fa7e18a](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/fa7e18a92548f9fb0881bea5c4ba6f8673e03e47))
* add THPS-style scoring with combo multiplier and high score ([#136](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/136)) ([2f15dba](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/2f15dba84dab710638c3340a88674e06cb1864e2))
* derive real tree positions/heights from LIDAR canopy data ([#140](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/140)) ([5e40779](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/5e407790d93b34ac57f607efe04ffd185f5704a8)), closes [#50](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/50)
* make up arrow pedal instead of jump ([#125](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/125)) ([894a4d5](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/894a4d558e1181f37d3e3a5d3c89fdbae9e81b45))
* render rocky, ground-level tracks for the route and bridleway network ([#131](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/131)) ([8ec40c2](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/8ec40c204ba08f3395b35a562670ca679f8666a3))
* replace bike velocity-hack physics with CANNON.RaycastVehicle ([#66](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/66)) ([#141](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/141)) ([f9495ba](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f9495ba3ec3fc300ff48b52fdc42c9fb55c5bf11))
* replace hold-to-pedal with an on-demand speed boost ([#147](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/147)) ([ea4e1b8](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/ea4e1b8e8764f7e3172598d67b73ec6d8a4e5ae0))


### Bug Fixes

* bump GitHub Actions node-version from 20 to 22 ([#123](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/123)) ([c26201c](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/c26201c05381dc4e00d062fec63c8937e859ee7a)), closes [#121](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/121)
* mirror steering while rolling backward, strengthen boost, add e-bike mode ([#110](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/110)) ([#188](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/188)) ([7ecd860](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/7ecd860d64bc25de937074b8b2d971a441f96455))
* spawn the bike facing down the track instead of a fixed heading ([#190](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/190)) ([903f076](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/903f07655b954235c7764157709a0ca91bd9b68b))
* spawn/reset the bike flush with terrain slope instead of dead level ([#162](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/162)) ([733d8cd](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/733d8cddd2f18df0915829f2ca35d7b0d287f197))
* stack top-left HUD elements to stop credits overlapping location ([#132](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/132)) ([34fb0dd](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/34fb0dde90da8e90ae04e5b76ae48e6e1aa1b985))
* stop the bike tipping over constantly and let it climb hills ([#189](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/189)) ([75feafe](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/75feafec8230fc0da3c4ab673f76114bb742e28e))
* unstick the bike when wheel raycasts miss the real terrain ([#148](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/148)) ([#149](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/149)) ([f48ef34](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f48ef3494004ce4264d890c450afb8669d042046))

## [0.3.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.2.0...peak-district-downhill-v0.3.0) (2026-07-03)


### Features

* add CI workflow to deploy builds to itch.io ([#114](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/114)) ([f1b91c0](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f1b91c0fb52179f6255970d1f1025c86d11ff03d))
* add in-game feedback button with prefilled GitHub issue link ([#112](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/112)) ([794d66e](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/794d66e9f4108e5ee26dce697b9ca04189ac8619)), closes [#107](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/107)
* add itch.io build target and publish docs ([#113](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/113)) ([d531add](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/d531add50ace16ffd533a9fed95c8ffe8a255ece)), closes [#108](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/108)
* add Open Graph/Twitter link-preview metadata and app icons ([#111](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/111)) ([b993fee](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/b993feead6f490a8010c9d000e0962c680b4d898))
* float route line above terrain and restyle as OS-bridleway green dashes ([#106](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/106)) ([95d8f57](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/95d8f57de1b6bae6a9884f5b0a5d93eaf5e2cd69))
* render surrounding roads, bridleways and footpaths ([#76](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/76)) ([#99](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/99)) ([5e2e0e3](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/5e2e0e33749f571635f88ffe805d9663668c5474))


### Bug Fixes

* pin itch.io publish action to v1.2.0 ([#118](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/118)) ([7b93575](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/7b935753201fa71c9fa1f287c06fece3e370d887)), closes [#117](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/117)
* retry GitHub Pages deploy on transient failure ([#102](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/102)) ([926ac3f](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/926ac3f025185439790b6bd3dcb132e691545e97))
* slow stamina drain and add a steady pedal rate once it's empty ([#97](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/97)) ([efa00ea](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/efa00ea6ad04b09ec658ecf703db011d3da35a6b))
* split three.js and cannon-es into separate vendor chunks ([#116](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/116)) ([33f6077](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/33f607764052e3f35674362d701e62975b482192)), closes [#115](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/115)
* stop cancelling in-progress Pages deployments ([#100](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/100)) ([e796553](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/e796553da6de89a9b32eaf6a1d44f8d9902ddc33))
* strengthen pedal acceleration so uphill sections are climbable ([#94](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/94)) ([95b0696](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/95b06966d353e44f770000cb1ebdec9954d9ca50))
* strengthen steady pedal rate so low gearing can sustain steep climbs ([#98](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/98)) ([d3ed685](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/d3ed685253a385dc988c3f511c786538d1735fdb))
* use itch.io's official setup-butler action instead of a third-party publish action ([#119](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/119)) ([75d91f6](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/75d91f641edeecbf1c697031e1a52f2bf5a79cdb))

## [0.2.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.1.0...peak-district-downhill-v0.2.0) (2026-07-03)


### Features

* add a night sky preset with moon, stars, and a bike headlight ([#82](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/82)) ([f385eeb](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f385eeb5b4475f155c3f9d1233c0ea11e95fa763))
* add dev-tools panel (debug info, log console, admin commands, crash reporting) ([#87](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/87)) ([cb79c43](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/cb79c4303ce5047003e9dc4a288b19b234b525de))
* add forward pedal input with a stamina mechanic ([#83](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/83)) ([436d34f](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/436d34fe1f6c4b8517fbddf3adbe638406d82747))
* add image-based lighting via PMREMGenerator ([#92](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/92)) ([564495c](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/564495c8b83660946b694ba48b75c985b9f82f42)), closes [#69](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/69)
* add landcover-driven terrain styling (woods, rock, track, heather) ([#46](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/46)) ([2a703da](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/2a703da5a1e23a6a56f68063acc54ca98e8ef503)), closes [#21](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/21)
* add minimap and OS grid reference/area name HUD ([#78](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/78)) ([abe9bbc](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/abe9bbced74ceeb447349ab0b61bd0ca1538a2cb))
* calibrate bike speed to real-world gravity, mass, and drag ([#77](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/77)) ([64345c9](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/64345c94635e04bcd872b18081a62ceacf0d4812))
* scatter trailside trees and rocks via THREE.InstancedMesh ([#80](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/80)) ([52389a1](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/52389a1e885589133ac409f7ba49dd5a6b29f72b)), closes [#70](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/70)


### Bug Fixes

* apply max anisotropic filtering to ground texture ([#71](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/71)) ([#91](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/91)) ([736e9ec](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/736e9ecd73dbed99fe5b94efe578907db5e13ae5))
* brighten bike headlight so it reads as visible at night ([#79](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/79)) ([#88](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/88)) ([25e71bc](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/25e71bcd042d96f0fdf10f378fd46a4c7f456171))
* deduplicate changelog entries from merge-commit history ([#42](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/42)) ([5d80c68](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/5d80c680dbd78fd8fabe37201658faa20c968aa9))
* give ground/bike contact real friction and near-zero restitution ([#58](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/58)) ([eec3f6d](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/eec3f6dd736e89429dfbcaa695b963121f339e39))
* prevent bike physics body from falling asleep and ignoring input ([#86](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/86)) ([d02cf4b](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/d02cf4bd4978076ab1bd6da4fccb72246b86e6db))
* stop ground contact from spinning the bike off its steering heading ([#48](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/48)) ([f8758ae](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f8758ae48736ccb2c9a9184858e9ac735ee7d7f8)), closes [#20](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/20)

## [0.1.0](https://github.com/Joe-Heffer/Peak-District-Downhill/compare/peak-district-downhill-v0.0.1...peak-district-downhill-v0.1.0) (2026-07-02)


### Features

* add dynamic sky dome with time-of-day presets ([612f2f5](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/612f2f555ac2a613be7fa9cc823b675d4c438985))
* add music mute button ([b9a7b16](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/b9a7b162a0f5777848155d4a72fc0408bd43cd31))
* add procedural bike model, terrain texture and audio placeholders ([aef21bb](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/aef21bbda92b9be05a48fca99a59ae71ad04ce85))
* add procedural sky, dynamic lighting and atmosphere ([774aca4](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/774aca4e82487311e84b0eec9b9245d57ef37aaa))
* add real ground texture and audio assets ([#32](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/32)) ([b030577](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/b030577e3b33f3046ae867384896e0766f43d455))
* model terrain and route on the real Cut Gate descent ([f684d94](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/f684d9453d93c3084cd29927d82beaf5e26a79e0))


### Bug Fixes

* correct Cut Gate LIDAR AOI bounding box and regenerate real data ([37cc088](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/37cc088ba65336896fab298521899ee97f4ed8de))
* correct oversized bike model scale ([ce66925](https://github.com/Joe-Heffer/Peak-District-Downhill/commit/ce66925798e8d795d4beafdda29aeae8f3897f63)), closes [#10](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/10)
