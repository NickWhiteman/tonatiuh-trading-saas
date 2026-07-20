export class ApiError {
    status: number
    message: string;

    constructor (status: number, msg: string) {
        this.status = status;
        this.message = msg
    }

    public static Server(msg: string) {
        return new ApiError(500, msg)
    }

    public static Unauthorized(msg: string) {
        return new ApiError(401, msg)
    }

    public static Forbidden(msg: string) {
        return new ApiError(403, msg)
    }

    public static NotFound(msg: string) {
        return new ApiError(404, msg)
    }

    public static BadRequest(msg: string) {
        return new ApiError(400, msg)
    }
}