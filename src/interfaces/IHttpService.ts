import { OptionsRequest } from "../types/types";

export interface IHttpService {
    get<T>(url: string, options?: OptionsRequest): Promise<T>;
    post<T>(url: string, options?: OptionsRequest): Promise<T>;
    put<T>(url: string, options?: OptionsRequest): Promise<T>;
}