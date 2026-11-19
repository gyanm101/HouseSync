import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

type LoginPageProps = {
    onShowRegister: () => void;
};


export default function LoginPage({
                                      onShowRegister
                                  }: LoginPageProps) {
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);


    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError('');
        setSubmitting(true);

        try {
            await login(email, password);
        } catch (error) {
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Login failed');
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            <h1>HouseSync</h1>

            <h2>Log in</h2>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">
                        Email
                    </label>

                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        required
                    />
                </div>

                <div>
                    <label htmlFor="password">
                        Password
                    </label>

                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                            setPassword(event.target.value)
                        }
                        required
                    />
                </div>

                {error && (
                    <p>
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                >
                    {submitting
                        ? 'Logging in...'
                        : 'Log in'}
                </button>
            </form>
            <p>
                Don't have an account?
            </p>

            <button
                type="button"
                onClick={onShowRegister}
            >
                Create account
            </button>
        </div>
    );
}

