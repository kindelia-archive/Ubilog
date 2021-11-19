import { AddressOptPort, parse_address_port } from "../../address.ts";

import { Validator } from "../types.ts";
import { BaseValidator } from "./base.ts";

export const address_opt_port_validator: Validator<AddressOptPort> = new BaseValidator<
  AddressOptPort
>(parse_address_port);
