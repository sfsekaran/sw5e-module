import ManeuverData from "./maneuver.mjs";
import { getLegacyModuleType, getModuleType } from "../../module-support.mjs";

export { ManeuverData };

export const config = {
  [getModuleType("maneuver")]: ManeuverData,
  [getLegacyModuleType("maneuver")]: ManeuverData
};
