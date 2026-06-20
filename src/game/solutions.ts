import type { Maneuver } from "./autopilot";

/**
 * Verified demo solutions, keyed by "<rigId>/<scenarioId>". Each is a control
 * sequence the Demo plays back, and that test/solvable.test.ts replays through the
 * real physics to PROVE it parks the trailer (reverse-only for all of these).
 *
 * Values are FULL PRECISION on purpose: these parks are tight (especially the
 * short-wheelbase rigs) and rounding the steers/durations can push the trailer out
 * of the target box. Each was found by search + reverse-engineering and then
 * independently re-simulated through the core physics before being trusted.
 */
export const SOLUTIONS: Record<string, Maneuver> = {
  "odyssey-utility/street-to-driveway-90": [
    { gear: "reverse", steer: 0.3209137181226225, seconds: 2.560367215202747 },
    { gear: "reverse", steer: 0.4743092941651077, seconds: 2.6725572427055035 },
  ],
  "ioniq5-utility/street-to-driveway-90": [
    { gear: "reverse", steer: 0.3345055363297127, seconds: 1.4267395411814618 },
    { gear: "reverse", steer: 0.03593048059015149, seconds: 0.1 },
    { gear: "reverse", steer: 0.35282340650327393, seconds: 5.263643916349523 },
  ],
  "tractor-ag/street-to-driveway-90": [
    { gear: "reverse", steer: 0.039525373838841915, seconds: 2.5339565254747867 },
    { gear: "reverse", steer: 0.4127404107712209, seconds: 3.398072532378137 },
    { gear: "reverse", steer: 0.5126050980761647, seconds: 0.33110527992248534 },
  ],
  "odyssey-dual/street-to-driveway-90": [
    { gear: "reverse", steer: 0.18128765749004483, seconds: 2.1970151047833264 },
    { gear: "reverse", steer: 0.572523013559252, seconds: 4.0998980855054405 },
  ],
  "odyssey-utility/apron-to-loading-dock": [
    { gear: "reverse", steer: 0.2, seconds: 3.4 },
    { gear: "reverse", steer: 0.08, seconds: 2.4 },
  ],
  // Found by a kinodynamic-RRT motion planner from a straight street start;
  // reverse-only, verified to park (score ~87).
  "odyssey-utility/driveway-straight-start": [
    { gear: "reverse", steer: -1, seconds: 0.5 },
    { gear: "reverse", steer: -0.55, seconds: 0.5 },
    { gear: "reverse", steer: 1, seconds: 2.4273053505538873 },
    { gear: "reverse", steer: 0.55, seconds: 0.8 },
    { gear: "reverse", steer: 1, seconds: 2.4 },
    { gear: "reverse", steer: 0.55, seconds: 1.6731570513076335 },
    { gear: "reverse", steer: -0.9556019526626729, seconds: 1.2877949867154286 },
    { gear: "reverse", steer: -0.42585798223376276, seconds: 0.9347265038482286 },
  ],
  // New scenarios: search-found, adversarially-verified, all reverse-only.
  "odyssey-utility/street-to-gate-narrow": [
    { gear: "reverse", steer: -0.3690815973095596, seconds: 1.9355150305330755 },
    { gear: "reverse", steer: -0.5800595700927078, seconds: 1.9490679452195763 },
    { gear: "reverse", steer: -0.3756404554005712, seconds: 0.5402605695007368 },
  ],
  "odyssey-utility/flanked-loading-dock": [
    { gear: "reverse", steer: 0.2, seconds: 3.3585279999999997 },
    { gear: "reverse", steer: 0.08, seconds: 2.6846720000000004 },
  ],
  "odyssey-utility/parallel-park-curb": [
    { gear: "reverse", steer: 0.42869613374988375, seconds: 0.5793468018897566 },
    { gear: "reverse", steer: 0.005262709169305296, seconds: 1.0646937750581156 },
    { gear: "reverse", steer: -0.6141256532883856, seconds: 3.8052696999652635 },
    { gear: "reverse", steer: -0.19700956252264298, seconds: 2.627050970181381 },
  ],
  "odyssey-utility/lcorner-backin-90": [
    { gear: "reverse", steer: -0.043165, seconds: 3.198813 },
    { gear: "reverse", steer: 0.381121, seconds: 2.205931 },
    { gear: "reverse", steer: 0.916154, seconds: 2.391716 },
    { gear: "reverse", steer: 0.566398, seconds: 2.249586 },
  ],
  // Solved WITH the gravity-roll active (the old flat maneuver no longer parks here).
  "odyssey-utility/driveway-downhill": [
    { gear: "reverse", steer: 0.3372630379162728, seconds: 4.596609081085771 },
    { gear: "reverse", steer: 1, seconds: 0.483036484522745 },
    { gear: "reverse", steer: 0.37888668235391376, seconds: 0.925833912882954 },
  ],
  "odyssey-utility/blindside-backin": [
    { gear: "reverse", steer: -0.3089021208083951, seconds: 2.1242711953021627 },
    { gear: "reverse", steer: -0.43663049239002205, seconds: 3.2279808000209864 },
    { gear: "reverse", steer: -0.2215, seconds: 1.7375000000000003 },
  ],
  // Second batch of search-found, adversarially-verified reverse-only demos.
  "odyssey-utility/driveway-uphill": [
    { gear: "reverse", steer: 0.3388465525297665, seconds: 6.718324283466594 },
    { gear: "reverse", steer: 0.4508558626843643, seconds: 0.9992096345402348 },
  ],
  "odyssey-utility/s-curve-alley": [
    { gear: "reverse", steer: 0.09044129103422163, seconds: 2.053448130735537 },
    { gear: "reverse", steer: -0.49223926166236315, seconds: 2.229890421752368 },
    { gear: "reverse", steer: 0.16916409698186943, seconds: 2.4136178172193468 },
    { gear: "reverse", steer: 0.5363533648337149, seconds: 2.211238063530194 },
    { gear: "reverse", steer: 0.03951190957599084, seconds: 1.2981540770650166 },
    { gear: "reverse", steer: -0.10914602159702025, seconds: 1.44582180542387 },
  ],
  "odyssey-utility/garage-straight": [
    { gear: "reverse", steer: -0.028891550303166515, seconds: 2.9777926672250032 },
    { gear: "reverse", steer: 0.4726498799414807, seconds: 1.1183340085670352 },
  ],
  "odyssey-utility/angled-spot": [
    { gear: "reverse", steer: -0.5249639771878719, seconds: 2.857694262359291 },
    { gear: "reverse", steer: 0.24647840039804578, seconds: 0.8828421805985273 },
  ],
  "odyssey-utility/long-chute": [
    { gear: "reverse", steer: -0.0161, seconds: 1.087 },
    { gear: "reverse", steer: 0.0196, seconds: 1.382 },
    { gear: "reverse", steer: 0.0443, seconds: 0.588 },
    { gear: "reverse", steer: 0.0037, seconds: 1.034 },
    { gear: "reverse", steer: 0.0098, seconds: 1.118 },
    { gear: "reverse", steer: 0.1469, seconds: 1.44 },
  ],
  "ioniq5-utility/apron-to-loading-dock": [
    { gear: "reverse", steer: 0.2, seconds: 3.4 },
    { gear: "reverse", steer: -0.014559837897471286, seconds: 2.7197381481298297 },
  ],
  "ioniq5-utility/driveway-straight-start": [
    { gear: "reverse", steer: -0.48228375491517733, seconds: 1.3710406849115484 },
    { gear: "reverse", steer: 1, seconds: 3.909687840874546 },
    { gear: "reverse", steer: -0.2509576994459431, seconds: 1.7647368972257924 },
    { gear: "reverse", steer: 0.08664289075112018, seconds: 0.2550974380626428 },
    { gear: "reverse", steer: 0.9655589548130601, seconds: 2.5549170215538015 },
    { gear: "reverse", steer: -0.9879138341344279, seconds: 0.9677376184701726 },
  ],
  "ioniq5-utility/street-to-gate-narrow": [
    { gear: "reverse", steer: -0.3690815973095596, seconds: 1.9355150305330755 },
    { gear: "reverse", steer: -0.5253635408885639, seconds: 3.2477538415985823 },
    { gear: "reverse", steer: 0.3837873529513308, seconds: 0.5405769655436834 },
  ],
  "ioniq5-utility/flanked-loading-dock": [
    { gear: "reverse", steer: 0.19876078822147233, seconds: 3.4044807200085403 },
    { gear: "reverse", steer: 0.009965891412089364, seconds: 2.703082800814344 },
  ],
  "ioniq5-utility/parallel-park-curb": [
    { gear: "reverse", steer: 0.5384769721836679, seconds: 0.1 },
    { gear: "reverse", steer: 0.3488675522700558, seconds: 1.1165070016380365 },
    { gear: "reverse", steer: -0.6299947920671822, seconds: 4.006801739577005 },
    { gear: "reverse", steer: 0.21816479061828403, seconds: 1.1030134404980623 },
  ],
  "ioniq5-utility/lcorner-backin-90": [
    { gear: "reverse", steer: -0.043165, seconds: 3.198813 },
    { gear: "reverse", steer: 0.38451923270769395, seconds: 2.224207336074293 },
    { gear: "reverse", steer: 0.916154, seconds: 2.391716 },
    { gear: "reverse", steer: 0.4038593830576566, seconds: 2.206589821456411 },
  ],
  "ioniq5-utility/driveway-downhill": [
    { gear: "reverse", steer: 0.47810906294163913, seconds: 1.3267439990911565 },
    { gear: "reverse", steer: -0.22012216452764463, seconds: 1.581822590243184 },
    { gear: "reverse", steer: 0.723367236417812, seconds: 3.2579173263742778 },
  ],
  "ioniq5-utility/blindside-backin": [
    { gear: "reverse", steer: -0.23184625711487136, seconds: 1.3112265680890123 },
    { gear: "reverse", steer: -0.6057665564169481, seconds: 1.144557228887782 },
    { gear: "reverse", steer: -0.19429791441397534, seconds: 1.3514767508442298 },
    { gear: "reverse", steer: -0.6279660517657237, seconds: 1.4875763164212716 },
    { gear: "reverse", steer: 0.25009943722372774, seconds: 1.828670650012612 },
  ],
  "ioniq5-utility/driveway-uphill": [
    { gear: "reverse", steer: 0.12840595379688344, seconds: 0.8032149113822786 },
    { gear: "reverse", steer: 0.579772847606132, seconds: 1.4607364249863302 },
    { gear: "reverse", steer: 0.31757373227636865, seconds: 2.5092569772937483 },
    { gear: "reverse", steer: 0.18789471443997952, seconds: 2.9768798346684227 },
  ],
  "ioniq5-utility/s-curve-alley": [
    { gear: "reverse", steer: 0.09044129103422163, seconds: 2.053448130735537 },
    { gear: "reverse", steer: -0.49223926166236315, seconds: 2.229890421752368 },
    { gear: "reverse", steer: 0.16916409698186943, seconds: 2.4136178172193468 },
    { gear: "reverse", steer: 0.5199154691282628, seconds: 2.1043908481490927 },
    { gear: "reverse", steer: 0.5087072568163044, seconds: 0.7782636026459816 },
    { gear: "reverse", steer: -0.2177597890966865, seconds: 2.210406311055555 },
  ],
  "ioniq5-utility/garage-straight": [
    { gear: "reverse", steer: -0.02816406294139038, seconds: 2.9684697557187354 },
    { gear: "reverse", steer: 0.5060091772726681, seconds: 1.2206004167277007 },
  ],
  "ioniq5-utility/angled-spot": [
    { gear: "reverse", steer: -0.5169008309159205, seconds: 3.034960114645689 },
    { gear: "reverse", steer: 1, seconds: 0.7613351628495321 },
  ],
  "ioniq5-utility/long-chute": [
    { gear: "reverse", steer: -0.0161, seconds: 1.087 },
    { gear: "reverse", steer: 0.0196, seconds: 1.382 },
    { gear: "reverse", steer: 0.0443, seconds: 0.588 },
    { gear: "reverse", steer: 0.03047815983787179, seconds: 1.3706120901124734 },
    { gear: "reverse", steer: 0.001990866110600232, seconds: 0.8708595710461966 },
    { gear: "reverse", steer: 0.1469, seconds: 1.44 },
  ],
  "odyssey-dual/apron-to-loading-dock": [
    { gear: "reverse", steer: 0.15839030276698163, seconds: 2.986538571649986 },
    { gear: "reverse", steer: 0.2289195006953924, seconds: 2.6218811526933385 },
  ],
  "odyssey-dual/driveway-straight-start": [
    { gear: "reverse", steer: -1, seconds: 0.9701409234502649 },
    { gear: "reverse", steer: -0.22006601779070553, seconds: 0.1 },
    { gear: "reverse", steer: 0.8737200151309424, seconds: 3.8658076003870065 },
    { gear: "reverse", steer: 0.5846411486991098, seconds: 0.1 },
    { gear: "reverse", steer: 1, seconds: 3.129840997817284 },
    { gear: "reverse", steer: 1, seconds: 0.3294835943933186 },
    { gear: "reverse", steer: -0.8582945205150092, seconds: 0.5585256588696714 },
    { gear: "reverse", steer: -0.8083333001846866, seconds: 1.7461390445868012 },
  ],
  "odyssey-dual/street-to-gate-narrow": [
    { gear: "reverse", steer: -0.16414906276676533, seconds: 2.1035685650122673 },
    { gear: "reverse", steer: -1, seconds: 1.7485392975804042 },
    { gear: "reverse", steer: -0.13669693602979313, seconds: 1.4871762921995595 },
  ],
  "odyssey-dual/flanked-loading-dock": [
    { gear: "reverse", steer: 0.2117046672289479, seconds: 2.6767036222106966 },
    { gear: "reverse", steer: -0.7694392648627643, seconds: 0.8724594092645821 },
    { gear: "reverse", steer: 0.7095817655818394, seconds: 2.103739555096347 },
  ],
  "odyssey-dual/parallel-park-curb": [
    { gear: "reverse", steer: 0.7006534385625812, seconds: 0.9544837648460739 },
    { gear: "reverse", steer: -0.38099509225036604, seconds: 0.7229581749338923 },
    { gear: "reverse", steer: -0.7782388223621246, seconds: 4.160303017490336 },
    { gear: "reverse", steer: 0.8797332713288265, seconds: 0.15713880331557167 },
  ],
  "odyssey-dual/lcorner-backin-90": [
    { gear: "reverse", steer: -0.6569990609772828, seconds: 0.1 },
    { gear: "reverse", steer: 0.02361473076596634, seconds: 2.512271648224265 },
    { gear: "reverse", steer: -0.907226802616415, seconds: 0.8590777248615246 },
    { gear: "reverse", steer: 0.5488586793631942, seconds: 1.4671844155690168 },
    { gear: "reverse", steer: 0.8956486146882499, seconds: 5.29425851922137 },
  ],
  "odyssey-dual/driveway-downhill": [
    { gear: "reverse", steer: 0.23580686613934365, seconds: 3.436289912152626 },
    { gear: "reverse", steer: 0.7153785335167506, seconds: 0.4339807676076706 },
    { gear: "reverse", steer: 0.8804096831572645, seconds: 1.8607998628627418 },
  ],
  "odyssey-dual/blindside-backin": [
    { gear: "reverse", steer: -0.21239187978464277, seconds: 2.285898529650062 },
    { gear: "reverse", steer: -0.4336805645443617, seconds: 3.271993623230829 },
    { gear: "reverse", steer: -0.9221336150607525, seconds: 1.2007510686770873 },
  ],
  "odyssey-dual/driveway-uphill": [
    { gear: "reverse", steer: 0.02273422108855494, seconds: 1.4243942824113662 },
    { gear: "reverse", steer: 0.6549474098389233, seconds: 2.5119970177164515 },
    { gear: "reverse", steer: 0.4723399800431394, seconds: 1.1372426082237699 },
    { gear: "reverse", steer: 0.038656759220304066, seconds: 2.153764061397603 },
  ],
  "odyssey-dual/s-curve-alley": [
    { gear: "reverse", steer: 0.18762434538764228, seconds: 1.5455052962438491 },
    { gear: "reverse", steer: -0.3722935515425479, seconds: 2.342281306536683 },
    { gear: "reverse", steer: -0.11470345143379514, seconds: 2.5743999239872206 },
    { gear: "reverse", steer: 0.24305257930117663, seconds: 1.4752886493297233 },
    { gear: "reverse", steer: -0.6158799683440479, seconds: 0.531486387754653 },
    { gear: "reverse", steer: 0.9840129027181538, seconds: 2.9348765089729967 },
  ],
  "odyssey-dual/garage-straight": [
    { gear: "reverse", steer: -0.06443093200252964, seconds: 2.864000091886029 },
    { gear: "reverse", steer: 0.7287433098568405, seconds: 0.814177755699594 },
  ],
  "odyssey-dual/angled-spot": [
    { gear: "reverse", steer: -0.4226758679289076, seconds: 1.770409082185044 },
    { gear: "reverse", steer: -0.6377176927799625, seconds: 1.5440589980402926 },
  ],
  "odyssey-dual/long-chute": [
    { gear: "reverse", steer: 0.00020128048451766023, seconds: 1.141593760422968 },
    { gear: "reverse", steer: -0.15668771811241478, seconds: 1.0175899199574254 },
    { gear: "reverse", steer: 0.7454651606443151, seconds: 0.6020952462638639 },
    { gear: "reverse", steer: -0.2048625089087912, seconds: 1.4915677758574013 },
    { gear: "reverse", steer: -0.3634810575140403, seconds: 0.33401928396145797 },
    { gear: "reverse", steer: 0.07139853392313213, seconds: 1.6270807688565447 },
  ],
  "tractor-ag/apron-to-loading-dock": [
    { gear: "reverse", steer: 0.06443339331443977, seconds: 3.6983688941820403 },
    { gear: "reverse", steer: 0.449965363058983, seconds: 1.8077774608837125 },
  ],
  "tractor-ag/driveway-straight-start": [
    { gear: "reverse", steer: -0.6861690691087732, seconds: 1.607415136792997 },
    { gear: "reverse", steer: 0.9457554965715481, seconds: 3.0476742096525724 },
    { gear: "reverse", steer: 0.0795549733671887, seconds: 1.152499349924685 },
    { gear: "reverse", steer: 0.07844407805468058, seconds: 2.752745808682266 },
    { gear: "reverse", steer: 0.09282469605592233, seconds: 2.2984360586364634 },
  ],
  "tractor-ag/flanked-loading-dock": [
    { gear: "reverse", steer: 0.07007450565771203, seconds: 2.2199962284026036 },
    { gear: "reverse", steer: 0.10481101796124237, seconds: 3.1926725895939074 },
  ],
  "tractor-ag/parallel-park-curb": [
    { gear: "reverse", steer: 0.25928794694910373, seconds: 1.4208759957702097 },
    { gear: "reverse", steer: -0.019218315504924442, seconds: 1.3624447245767979 },
    { gear: "reverse", steer: -0.692874490407071, seconds: 2.9978626002357687 },
    { gear: "reverse", steer: -0.9323975629269753, seconds: 0.6397413955182001 },
  ],
  "tractor-ag/lcorner-backin-90": [
    { gear: "reverse", steer: -0.148684048765665, seconds: 2.2005965671252645 },
    { gear: "reverse", steer: 0.24626856523592683, seconds: 4.7226429017771006 },
    { gear: "reverse", steer: 0.4849382196381207, seconds: 2.8603714346785374 },
  ],
  "tractor-ag/driveway-downhill": [
    { gear: "reverse", steer: 0.08676656517177729, seconds: 3.7124632063212353 },
    { gear: "reverse", steer: 0.618084882522908, seconds: 1.6884793378307017 },
    { gear: "reverse", steer: 0.9536192570551211, seconds: 0.26399055520569564 },
  ],
  "tractor-ag/blindside-backin": [
    { gear: "reverse", steer: -0.03961252895275488, seconds: 2.159736376747868 },
    { gear: "reverse", steer: -0.31461539278825923, seconds: 4.445446608442467 },
  ],
  "tractor-ag/driveway-uphill": [
    { gear: "reverse", steer: 0.030504058837687024, seconds: 2.336294624319581 },
    { gear: "reverse", steer: 0.34008014575017903, seconds: 4.750138728620189 },
  ],
  "tractor-ag/s-curve-alley": [
    { gear: "reverse", steer: 0.3183862662502239, seconds: 1.268787054806196 },
    { gear: "reverse", steer: -0.49094425411994236, seconds: 2.135593469184097 },
    { gear: "reverse", steer: 0.1501948456307316, seconds: 0.8987881117664972 },
    { gear: "reverse", steer: 0.03123332528327585, seconds: 1.7505039393347146 },
    { gear: "reverse", steer: 0.043419780421959625, seconds: 2.614050920862609 },
    { gear: "reverse", steer: 0.5237859007619415, seconds: 2.6819691119288063 },
  ],
  "tractor-ag/garage-straight": [
    { gear: "reverse", steer: -0.1079708434462687, seconds: 1.647598267130856 },
    { gear: "reverse", steer: 0.2853190989883799, seconds: 1.399114806897236 },
    { gear: "reverse", steer: -0.9435261106999228, seconds: 0.4166774729775328 },
  ],
  "tractor-ag/angled-spot": [
    { gear: "reverse", steer: -0.2301133143658873, seconds: 2.4101203255167567 },
    { gear: "reverse", steer: -0.5156471259300293, seconds: 0.6915536308993594 },
  ],
  "tractor-ag/long-chute": [
    { gear: "reverse", steer: 0.14372602841856172, seconds: 0.8354403306653776 },
    { gear: "reverse", steer: -0.2348796696574112, seconds: 1.3949306014698024 },
    { gear: "reverse", steer: 0.15588317224179804, seconds: 0.6178232592497689 },
    { gear: "reverse", steer: 0.12457291176649632, seconds: 1.4296634413784308 },
    { gear: "reverse", steer: -0.18999381871737148, seconds: 0.5124538341174881 },
    { gear: "reverse", steer: 0.09283922458639605, seconds: 1.2314394785223441 },
  ],
};
