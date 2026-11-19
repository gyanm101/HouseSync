import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

type RegisterPageProps = {
    onShowLogin: () => void;
};

export default function RegisterPage({
                                         onShowLogin
                                     }: RegisterPageProps) {
    const { register } = useAuth();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setError('');
        setSubmitting(true);

        try {
            await register(
                name,
                email,
                password
            );
        } catch (error) {
            if (error instanceof Error) {
                setError(error.message);
            } else {
                setError('Registration failed');
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            <h1>HouseSync</h1>

            <h2>Create account</h2>

            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="name">
                        Name
                    </label>

                    <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(event) =>
                            setName(event.target.value)
                        }
                        required
                    />
                </div>

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
                        minLength={8}
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
                        ? 'Creating account...'
                        : 'Create account'}
                </button>
            </form>

            <p>
                Already have an account?
            </p>

            <button
                type="button"
                onClick={onShowLogin}
            >
                Log in
            </button>
        </div>
    );
}