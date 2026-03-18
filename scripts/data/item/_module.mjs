import ManeuverData from "./maneuver.mjs";
import StarshipModData from "./starshipmod.mjs";
import StarshipSizeData from "./starshipsize.mjs";

export { ManeuverData, StarshipModData, StarshipSizeData };

export const config = {
  ["sw5e.maneuver"]:     ManeuverData,
  ["sw5e.starshipmod"]:  StarshipModData,
  ["sw5e.starshipsize"]: StarshipSizeData
};
