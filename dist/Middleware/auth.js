import jwt from 'jsonwebtoken';
const SECRET_KEY = process.env.SECRET_KEY;
export const auth = async (c, next) => {
    const header = c.req.header('token');
    if (!header) {
        console.log("No token");
        return c.text('Unauthorized: No token', 401);
    }
    const token = header.replace('Bearer ', '');
    try {
        const payload = jwt.verify(token, SECRET_KEY);
        if (typeof payload !== "object") {
            console.log("Token is not object");
            c.status(500);
            return c.text("Server error");
        }
        c.set('user', payload);
    }
    catch (err) {
        console.log(err);
        console.log(token);
        return c.text('Unauthorized: Invalid token', 401);
    }
    await next();
};
