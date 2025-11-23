import { ValidateIf } from 'class-validator';

/**
 * Apply on a property to validate it only when the key exists
 * in the input object. If the key is omitted, validators are skipped.
 *
 * Presence means the property name appears in the payload object,
 * regardless of value (null/undefined included).
 */
export function ValidateIfPresent(): PropertyDecorator {
    return (target: Object, propertyKey: string | symbol) => {
        ValidateIf((obj) =>
            Object.prototype.hasOwnProperty.call(obj, propertyKey as string)
        )(target, propertyKey as string);
    };
}
